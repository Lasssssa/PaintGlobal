// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PaintVote
 * @notice Decentralized voting platform for paintings
 * Deploy on ARC Testnet or any EVM-compatible chain
 */
contract PaintVote {
    // ─── State ────────────────────────────────────────────────────────────────

    string[] public paintingURIs;

    /// @notice votes[paintingId] = vote count
    mapping(uint256 => uint256) public votes;

    /// @notice hasVoted[voter][paintingId] = true if already voted
    mapping(address => mapping(uint256 => bool)) public hasVoted;

    // ─── Events ───────────────────────────────────────────────────────────────

    event PaintingAdded(uint256 indexed id, string uri, address indexed author);
    event Voted(uint256 indexed paintingId, address indexed voter);

    // ─── Write ────────────────────────────────────────────────────────────────

    /// @notice Add a new painting by providing its metadata URI (stored on IPFS)
    function addPainting(string calldata uri) external {
        uint256 id = paintingURIs.length;
        paintingURIs.push(uri);
        emit PaintingAdded(id, uri, msg.sender);
    }

    /// @notice Cast one vote for a painting. Reverts if already voted.
    function vote(uint256 paintingId) external {
        require(paintingId < paintingURIs.length, "PaintVote: invalid painting");
        require(!hasVoted[msg.sender][paintingId], "PaintVote: already voted");

        hasVoted[msg.sender][paintingId] = true;
        votes[paintingId] += 1;

        emit Voted(paintingId, msg.sender);
    }

    // ─── NFC Write (gasless via relayer) ──────────────────────────────────────

    /// @notice Vote via NFC bracelet signature. Called by the relayer.
    function voteWithNfc(
        uint256 paintingId,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes32 hash,
        bytes calldata message
    ) external {
        require(paintingId < paintingURIs.length, "PaintVote: invalid painting");
        require(_messageToHash(message) == hash, "PaintVote: invalid hash");

        address signer = ecrecover(hash, v, r, s);
        require(signer != address(0), "PaintVote: invalid signature");

        // Decode paintingId from message (2 bytes big-endian uint16)
        require(message.length >= 2, "PaintVote: message too short");
        uint256 decodedId = (uint256(uint8(message[0])) << 8) | uint256(uint8(message[1]));
        require(decodedId == paintingId, "PaintVote: id mismatch");

        require(!hasVoted[signer][paintingId], "PaintVote: already voted");

        hasVoted[signer][paintingId] = true;
        votes[paintingId] += 1;

        emit Voted(paintingId, signer);
    }

    /// @notice Publish a painting via NFC bracelet signature. Called by the relayer.
    function addPaintingWithNfc(
        string calldata uri,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes32 hash,
        bytes calldata message
    ) external {
        require(_messageToHash(message) == hash, "PaintVote: invalid hash");

        address signer = ecrecover(hash, v, r, s);
        require(signer != address(0), "PaintVote: invalid signature");

        uint256 id = paintingURIs.length;
        paintingURIs.push(uri);
        emit PaintingAdded(id, uri, signer);
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    /// @notice Return all painting URIs at once
    function getPaintings() external view returns (string[] memory) {
        return paintingURIs;
    }

    /// @notice Total number of paintings
    function paintingCount() external view returns (uint256) {
        return paintingURIs.length;
    }

    // ─── Internal EIP-191 helpers ─────────────────────────────────────────────

    function _messageToHash(bytes memory message) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n",
            _uintToStr(message.length),
            message
        ));
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
