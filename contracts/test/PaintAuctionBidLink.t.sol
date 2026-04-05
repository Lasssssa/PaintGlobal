// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PaintAuction.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract TestNFT is ERC721 {
    constructor() ERC721("Test", "TST") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }
}

contract PaintAuctionBidLinkTest is Test {
    PaintAuction internal auction;
    TestNFT internal nft;

    uint256 internal sellerPk = 0xA11;
    uint256 internal payerPk = 0xB22;
    uint256 internal nfcPk = 0xC33;
    uint256 internal otherPayerPk = 0xD44;
    uint256 internal otherNfcPk = 0xE55;

    address internal seller;
    address internal payer;
    address internal nfcBracelet;
    address internal otherPayer;
    address internal otherNfc;
    address internal proceedsWallet;

    function setUp() public {
        seller = vm.addr(sellerPk);
        payer = vm.addr(payerPk);
        nfcBracelet = vm.addr(nfcPk);
        otherPayer = vm.addr(otherPayerPk);
        otherNfc = vm.addr(otherNfcPk);
        proceedsWallet = address(0xF00D);

        auction = new PaintAuction();
        nft = new TestNFT();
        nft.mint(seller, 1);
        vm.deal(payer, 100 ether);
        vm.deal(otherPayer, 100 ether);
    }

    function _ethSignedMessageHash(bytes memory message) internal pure returns (bytes32) {
        return keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n", _uintToStr(message.length), message)
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

    function _packBidLinkMessage(address payerAddr, uint256 linkNonce) internal pure returns (bytes memory) {
        return abi.encodePacked(bytes20(uint160(payerAddr)), bytes32(linkNonce));
    }

    function _packCreateAuctionMessage(
        uint256 tokenId,
        address payerWallet_,
        uint256 startPrice,
        uint256 durationSeconds,
        uint256 nonce
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(tokenId, payerWallet_, startPrice, durationSeconds, nonce);
    }

    function _sign(uint256 pk, bytes memory message) internal view returns (uint8 v, bytes32 r, bytes32 s, bytes32 hash) {
        hash = _ethSignedMessageHash(message);
        (v, r, s) = vm.sign(pk, hash);
    }

    function _createAuctionForToken1(uint256 startPrice, uint256 duration) internal returns (uint256 auctionId) {
        vm.startPrank(seller);
        nft.approve(address(auction), 1);
        vm.stopPrank();

        uint256 nonce = auction.nonces(seller);
        bytes memory message =
            _packCreateAuctionMessage(1, proceedsWallet, startPrice, duration, nonce);
        (uint8 v, bytes32 r, bytes32 s, bytes32 hash) = _sign(sellerPk, message);

        auctionId = auction.createAuction(
            address(nft),
            1,
            proceedsWallet,
            startPrice,
            duration,
            nonce,
            v,
            r,
            s,
            hash,
            message
        );
    }

    function _registerPayer(uint256 nfcPrivateKey, address payerAddr) internal {
        address nfc = vm.addr(nfcPrivateKey);
        uint256 linkNonce = auction.bidLinkNonces(nfc);
        bytes memory message = _packBidLinkMessage(payerAddr, linkNonce);
        (uint8 v, bytes32 r, bytes32 s, bytes32 hash) = _sign(nfcPrivateKey, message);
        vm.prank(payerAddr);
        auction.registerBidPayer(v, r, s, hash, message);
    }

    function test_RegisterBidPayer_SetsMapping() public {
        assertEq(auction.bidPayerToNfc(payer), address(0));
        _registerPayer(nfcPk, payer);
        assertEq(auction.bidPayerToNfc(payer), nfcBracelet);
        assertEq(auction.bidLinkNonces(nfcBracelet), 1);
    }

    function test_RegisterBidPayer_RevertsWhenMessagePayerNotCaller() public {
        uint256 linkNonce = auction.bidLinkNonces(nfcBracelet);
        bytes memory message = _packBidLinkMessage(payer, linkNonce);
        (uint8 v, bytes32 r, bytes32 s, bytes32 hash) = _sign(nfcPk, message);

        vm.prank(otherPayer);
        vm.expectRevert(bytes("PaintAuction: payer mismatch"));
        auction.registerBidPayer(v, r, s, hash, message);
    }

    function test_Bid_RevertsWhenPayerNotLinked() public {
        _createAuctionForToken1(1 ether, 3600);

        vm.prank(payer);
        vm.expectRevert(bytes("PaintAuction: payer not linked"));
        auction.bid{value: 1 ether}(0);
    }

    function test_Bid_Finalize_NftGoesToNfc_NotPayer() public {
        uint256 aid = _createAuctionForToken1(1 ether, 3600);
        _registerPayer(nfcPk, payer);

        vm.prank(payer);
        auction.bid{value: 1 ether}(aid);

        vm.warp(block.timestamp + 3601);
        auction.finalizeAuction(aid);

        assertEq(nft.ownerOf(1), nfcBracelet);
        assertEq(proceedsWallet.balance, 1 ether);
    }

    function test_TwoBids_RefundsPayer_OutbidNftRecipientSnapshot() public {
        uint256 aid = _createAuctionForToken1(1 ether, 3600);
        _registerPayer(nfcPk, payer);
        _registerPayer(otherNfcPk, otherPayer);

        vm.prank(payer);
        auction.bid{value: 1 ether}(aid);

        uint256 balBefore = payer.balance;
        vm.prank(otherPayer);
        auction.bid{value: 2 ether}(aid);
        assertEq(payer.balance, balBefore + 1 ether);

        vm.warp(block.timestamp + 3601);
        auction.finalizeAuction(aid);

        assertEq(nft.ownerOf(1), otherNfc);
        assertEq(proceedsWallet.balance, 2 ether);
    }

    function test_Cancel_NoBids_UsesHighestPayer() public {
        uint256 aid = _createAuctionForToken1(1 ether, 3600);

        bytes memory message = abi.encodePacked(bytes32(aid));
        (uint8 v, bytes32 r, bytes32 s, bytes32 hash) = _sign(sellerPk, message);

        vm.prank(address(0x1234));
        auction.cancelAuction(aid, v, r, s, hash, message);

        assertEq(nft.ownerOf(1), seller);
    }
}
