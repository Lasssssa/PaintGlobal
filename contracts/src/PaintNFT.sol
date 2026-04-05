// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

/// @notice Minimal interface to read painting data from PaintVote.
interface IPaintVote {
    function getPainting(uint256 id)
        external
        view
        returns (string memory uri, address author, uint8 status);
}

/// @title PaintNFT — ERC-721 for PaintGlobal artworks
/// @notice Only the original author of a painting (as recorded in PaintVote)
///         can mint the corresponding NFT, and each painting can only be
///         minted once. Supports NFC bracelet mint via relayer.
contract PaintNFT is ERC721, ERC721URIStorage, ERC721Enumerable {
    uint256 private _nextTokenId;

    /// @notice The PaintVote contract used to verify painting authorship.
    IPaintVote public immutable paintVote;

    /// @notice Tracks which PaintVote painting IDs have already been minted.
    mapping(uint256 => bool) public paintingMinted;

    event Minted(address indexed owner, uint256 indexed tokenId, uint256 indexed paintingId, string uri);

    constructor(address _paintVote) ERC721("PaintGlobal", "PAINT") {
        require(_paintVote != address(0), "PaintNFT: zero address");
        paintVote = IPaintVote(_paintVote);
    }

    /// @notice Mint an NFT via NFC bracelet signature. Called by the relayer.
    ///         Verifies the signer is the painting's author and that the
    ///         painting has not been minted yet.
    /// @param paintingId  The painting ID in PaintVote.
    /// @param uri         Full URI pointing to ERC-721 JSON metadata on IPFS.
    /// @param v           Recovery byte of the ECDSA signature.
    /// @param r           R component of the ECDSA signature.
    /// @param s           S component of the ECDSA signature.
    /// @param hash        EIP-191 hash that was signed by the bracelet.
    /// @param message     Raw message bytes that were signed.
    /// @return tokenId    The newly minted token ID.
    function mintWithNfc(
        uint256 paintingId,
        string calldata uri,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes32 hash,
        bytes calldata message
    ) external returns (uint256 tokenId) {
        require(_messageToHash(message) == hash, "PaintNFT: invalid hash");

        address signer = ecrecover(hash, v, r, s);
        require(signer != address(0), "PaintNFT: invalid signature");

        (, address author,) = paintVote.getPainting(paintingId);
        require(signer == author, "PaintNFT: not the author");
        require(!paintingMinted[paintingId], "PaintNFT: already minted");

        paintingMinted[paintingId] = true;

        tokenId = _nextTokenId++;
        _safeMint(signer, tokenId);
        _setTokenURI(tokenId, uri);
        emit Minted(signer, tokenId, paintingId, uri);
    }

    /// @notice Approve a spender to transfer a token on behalf of the bracelet owner.
    ///         Called by the relayer. Verifies the bracelet signature authorises the approval.
    /// @dev    Message must be abi.encodePacked(tokenId, spender) — exactly 52 bytes.
    function approveWithNfc(
        uint256 tokenId,
        address spender,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes32 hash,
        bytes calldata message
    ) external {
        require(_messageToHash(message) == hash, "PaintNFT: invalid hash");
        address signer = ecrecover(hash, v, r, s);
        require(signer != address(0), "PaintNFT: invalid signature");
        require(ownerOf(tokenId) == signer, "PaintNFT: not owner");
        require(message.length == 52, "PaintNFT: bad message length");

        uint256 decodedId = uint256(bytes32(message[0:32]));
        address decodedSpender = address(bytes20(message[32:52]));
        require(decodedId == tokenId, "PaintNFT: tokenId mismatch");
        require(decodedSpender == spender, "PaintNFT: spender mismatch");

        _approve(spender, tokenId, signer);
    }

    // ── EIP-191 helpers (same scheme as PaintVote) ──────────────────────

    function _messageToHash(bytes memory message) internal pure returns (bytes32) {
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

    // ── Required overrides (ERC721 × URIStorage × Enumerable) ───────────

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721URIStorage, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
