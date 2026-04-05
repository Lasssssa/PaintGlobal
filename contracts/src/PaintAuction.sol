// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title PaintAuction — English auction for PaintGlobal NFTs
/// @notice Sellers identify via NFC bracelet signature; bidders use any connected wallet.
///         Payment is in native currency (USDC on ARC Testnet, 18 decimals).
///         The seller designates a payerWallet at auction creation; this is the address
///         that receives proceeds. The payerWallet is embedded in the bracelet-signed
///         message, so only the real bracelet owner can authorise it (anti-spoofing).
contract PaintAuction is ReentrancyGuard {

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Auction {
        address nftContract;     // PaintNFT address
        uint256 tokenId;         // ERC-721 token ID
        address seller;          // bracelet address (original NFT owner)
        address payerWallet;     // wallet that receives proceeds (connected via WalletConnect)
        uint256 startPrice;      // minimum first bid (18-decimal native USDC)
        uint256 endTime;         // unix timestamp when auction closes
        address highestBidder;   // address(0) if no bids yet
        uint256 highestBid;      // 0 if no bids yet
        bool finalized;          // true after finalize or cancel
    }

    // ─── State ────────────────────────────────────────────────────────────────

    uint256 private _nextAuctionId;

    /// @notice All auctions by ID (0-indexed, increments per auction created).
    mapping(uint256 => Auction) public auctions;

    /// @notice Per-bracelet nonce — prevents signature replay on createAuction.
    mapping(address => uint256) public nonces;

    /// @notice Pull-payment fallback for bid refunds that fail due to gas or revert.
    mapping(address => uint256) public pendingRefunds;

    // ─── Events ───────────────────────────────────────────────────────────────

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed payerWallet,
        uint256 tokenId,
        uint256 startPrice,
        uint256 endTime
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );

    event AuctionFinalized(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 amount
    );

    event AuctionCancelled(uint256 indexed auctionId);

    // ─── createAuction ────────────────────────────────────────────────────────

    /// @notice Create an auction for an NFT owned by the bracelet.
    ///         The relayer must have previously called PaintNFT.approveWithNfc to
    ///         approve this contract, then calls this function.
    ///
    /// @dev    Signed message bytes (148 bytes total, tight-packed):
    ///           tokenId        [32 bytes, uint256]
    ///           payerWallet    [20 bytes, address]
    ///           startPrice     [32 bytes, uint256]
    ///           durationSeconds[32 bytes, uint256]
    ///           nonce          [32 bytes, uint256]
    ///
    /// @param nftContract      Address of the ERC-721 contract (PaintNFT).
    /// @param tokenId          Token to auction.
    /// @param payerWallet      Address that receives proceeds when auction ends.
    /// @param startPrice       Minimum first bid (wei-denominated native USDC).
    /// @param durationSeconds  Auction duration. Must be between 60s and 30 days.
    /// @param nonce            Must equal nonces[signer] at time of signing.
    function createAuction(
        address nftContract,
        uint256 tokenId,
        address payerWallet,
        uint256 startPrice,
        uint256 durationSeconds,
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes32 hash,
        bytes calldata message
    ) external nonReentrant returns (uint256 auctionId) {
        // ── Signature verification ────────────────────────────────────────────
        require(_messageToHash(message) == hash, "PaintAuction: invalid hash");
        address signer = ecrecover(hash, v, r, s);
        require(signer != address(0), "PaintAuction: invalid signature");

        // ── Nonce check (replay protection) ───────────────────────────────────
        require(nonces[signer] == nonce, "PaintAuction: invalid nonce");
        nonces[signer]++;

        // ── Verify message contents match calldata ─────────────────────────────
        require(message.length == 148, "PaintAuction: bad message length");
        {
            uint256 mTokenId         = uint256(bytes32(message[0:32]));
            address mPayerWallet     = address(bytes20(message[32:52]));
            uint256 mStartPrice      = uint256(bytes32(message[52:84]));
            uint256 mDurationSeconds = uint256(bytes32(message[84:116]));
            uint256 mNonce           = uint256(bytes32(message[116:148]));

            require(mTokenId         == tokenId,         "PaintAuction: tokenId mismatch");
            require(mPayerWallet     == payerWallet,     "PaintAuction: payerWallet mismatch");
            require(mStartPrice      == startPrice,      "PaintAuction: startPrice mismatch");
            require(mDurationSeconds == durationSeconds, "PaintAuction: duration mismatch");
            require(mNonce           == nonce,           "PaintAuction: nonce mismatch");
        }

        // ── Business logic checks ─────────────────────────────────────────────
        require(IERC721(nftContract).ownerOf(tokenId) == signer, "PaintAuction: not owner");
        require(payerWallet != address(0), "PaintAuction: zero payerWallet");
        require(startPrice > 0, "PaintAuction: zero startPrice");
        require(durationSeconds >= 60 && durationSeconds <= 30 days, "PaintAuction: invalid duration");

        // ── Transfer NFT into escrow (requires prior approveWithNfc) ──────────
        IERC721(nftContract).transferFrom(signer, address(this), tokenId);

        // ── Store auction ──────────────────────────────────────────────────────
        auctionId = _nextAuctionId++;
        auctions[auctionId] = Auction({
            nftContract:   nftContract,
            tokenId:       tokenId,
            seller:        signer,
            payerWallet:   payerWallet,
            startPrice:    startPrice,
            endTime:       block.timestamp + durationSeconds,
            highestBidder: address(0),
            highestBid:    0,
            finalized:     false
        });

        emit AuctionCreated(auctionId, signer, payerWallet, tokenId, startPrice, block.timestamp + durationSeconds);
    }

    // ─── bid ──────────────────────────────────────────────────────────────────

    /// @notice Place a bid on an active auction. Send native USDC as msg.value.
    ///         The previous highest bidder is refunded automatically.
    ///         No bracelet or relay needed — call directly from any wallet.
    function bid(uint256 auctionId) external payable nonReentrant {
        Auction storage a = auctions[auctionId];

        // ── Checks ────────────────────────────────────────────────────────────
        require(!a.finalized, "PaintAuction: auction ended");
        require(block.timestamp < a.endTime, "PaintAuction: auction expired");
        require(msg.sender != a.seller, "PaintAuction: seller cannot bid");

        if (a.highestBidder == address(0)) {
            require(msg.value >= a.startPrice, "PaintAuction: below start price");
        } else {
            require(msg.value > a.highestBid, "PaintAuction: bid too low");
        }

        // ── Effects ───────────────────────────────────────────────────────────
        address prevBidder = a.highestBidder;
        uint256 prevBid    = a.highestBid;

        a.highestBidder = msg.sender;
        a.highestBid    = msg.value;

        // ── Interactions: refund previous bidder ──────────────────────────────
        if (prevBidder != address(0)) {
            (bool ok,) = prevBidder.call{value: prevBid}("");
            if (!ok) {
                // Graceful fallback: let them claim via claimRefund()
                pendingRefunds[prevBidder] += prevBid;
            }
        }

        emit BidPlaced(auctionId, msg.sender, msg.value);
    }

    // ─── finalizeAuction ─────────────────────────────────────────────────────

    /// @notice Settle an expired auction. Permissionless — anyone may call.
    ///         Transfers the NFT to the highest bidder and USDC to the payerWallet.
    ///         If no bids were placed the NFT is returned to the seller.
    function finalizeAuction(uint256 auctionId) external nonReentrant {
        Auction storage a = auctions[auctionId];

        // ── Checks ────────────────────────────────────────────────────────────
        require(!a.finalized, "PaintAuction: already finalized");
        require(block.timestamp >= a.endTime, "PaintAuction: not ended yet");

        // ── Effects ───────────────────────────────────────────────────────────
        a.finalized = true;

        // ── Interactions ──────────────────────────────────────────────────────
        if (a.highestBidder == address(0)) {
            // No bids — return NFT to seller
            IERC721(a.nftContract).transferFrom(address(this), a.seller, a.tokenId);
        } else {
            // Transfer NFT to winner
            IERC721(a.nftContract).transferFrom(address(this), a.highestBidder, a.tokenId);
            // Send proceeds to payerWallet
            (bool ok,) = a.payerWallet.call{value: a.highestBid}("");
            require(ok, "PaintAuction: payment failed");
            emit AuctionFinalized(auctionId, a.highestBidder, a.highestBid);
        }
    }

    // ─── cancelAuction ───────────────────────────────────────────────────────

    /// @notice Cancel an auction with no bids. Bracelet-signed, called by relayer.
    ///         Returns the NFT to the seller.
    ///
    /// @dev    Signed message bytes (32 bytes):
    ///           auctionId [32 bytes, uint256]
    function cancelAuction(
        uint256 auctionId,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes32 hash,
        bytes calldata message
    ) external nonReentrant {
        Auction storage a = auctions[auctionId];

        // ── Signature verification ─────────────────────────────────────────────
        require(_messageToHash(message) == hash, "PaintAuction: invalid hash");
        address signer = ecrecover(hash, v, r, s);
        require(signer != address(0), "PaintAuction: invalid signature");
        require(signer == a.seller, "PaintAuction: not seller");

        // ── Verify message encodes this auctionId ──────────────────────────────
        require(message.length == 32, "PaintAuction: bad message length");
        uint256 mAuctionId = uint256(bytes32(message[0:32]));
        require(mAuctionId == auctionId, "PaintAuction: auctionId mismatch");

        // ── Business logic checks ──────────────────────────────────────────────
        require(!a.finalized, "PaintAuction: already finalized");
        require(a.highestBidder == address(0), "PaintAuction: bids exist");

        // ── Effects ───────────────────────────────────────────────────────────
        a.finalized = true;

        // ── Interactions ──────────────────────────────────────────────────────
        IERC721(a.nftContract).transferFrom(address(this), a.seller, a.tokenId);

        emit AuctionCancelled(auctionId);
    }

    // ─── claimRefund ─────────────────────────────────────────────────────────

    /// @notice Claim a pending refund if the automatic refund during bid() failed.
    function claimRefund() external nonReentrant {
        uint256 amount = pendingRefunds[msg.sender];
        require(amount > 0, "PaintAuction: no pending refund");
        pendingRefunds[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "PaintAuction: refund failed");
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// @notice Get full auction data by ID.
    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return auctions[auctionId];
    }

    /// @notice Total number of auctions ever created (including finalized/cancelled).
    function auctionCount() external view returns (uint256) {
        return _nextAuctionId;
    }

    // ─── EIP-191 helpers (same scheme as PaintNFT / PaintVote) ───────────────

    function _messageToHash(bytes memory message) internal pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n",
                _uintToStr(message.length),
                message
            )
        );
    }

    function _uintToStr(uint256 val) internal pure returns (string memory) {
        if (val == 0) return "0";
        bytes memory reversed = new bytes(100);
        uint256 i = 0;
        while (val != 0) {
            reversed[i++] = bytes1(uint8(48 + val % 10));
            val /= 10;
        }
        bytes memory result = new bytes(i);
        for (uint256 j = 0; j < i; j++) {
            result[j] = reversed[i - j - 1];
        }
        return string(result);
    }
}
