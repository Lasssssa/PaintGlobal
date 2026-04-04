// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PaintVote
 * @notice Decentralized voting platform for paintings (moderation + one approved work per author)
 */
contract PaintVote {
    enum Status {
        Pending,
        Approved,
        Rejected
    }

    struct Painting {
        string uri;
        address author;
        Status status;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    address public owner;

    Painting[] public paintings;

    /// @notice votes[paintingId] = positive vote count
    mapping(uint256 => uint256) public votes;

    /// @notice negativeVotes[paintingId] = negative vote count
    mapping(uint256 => uint256) public negativeVotes;

    /// @notice hasVoted[voter][paintingId] = true if already voted positively
    mapping(address => mapping(uint256 => bool)) public hasVoted;

    /// @notice hasVotedNegative[voter][paintingId] = true if already voted negatively
    mapping(address => mapping(uint256 => bool)) public hasVotedNegative;

    /// @notice Author has at least one approved painting — no further submissions
    mapping(address => bool) public hasApprovedSubmission;

    /// @notice Author has a submission currently pending moderation
    mapping(address => bool) public hasPendingSubmission;

    // ─── Events ───────────────────────────────────────────────────────────────

    event PaintingAdded(uint256 indexed id, string uri, address indexed author);
    event PaintingApproved(uint256 indexed id, address indexed author);
    event PaintingRejected(uint256 indexed id, address indexed author);
    event Voted(uint256 indexed paintingId, address indexed voter, bool support);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "PaintVote: not owner");
        _;
    }

    constructor(address initialOwner) {
        require(initialOwner != address(0), "PaintVote: zero owner");
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    /// @notice Transfer contract ownership (moderation rights)
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "PaintVote: zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ─── Moderation ───────────────────────────────────────────────────────────

    function approve(uint256 id) external onlyOwner {
        require(id < paintings.length, "PaintVote: invalid painting");
        Painting storage p = paintings[id];
        require(p.status == Status.Pending, "PaintVote: not pending");

        p.status = Status.Approved;
        hasPendingSubmission[p.author] = false;
        hasApprovedSubmission[p.author] = true;

        emit PaintingApproved(id, p.author);
    }

    function reject(uint256 id) external onlyOwner {
        require(id < paintings.length, "PaintVote: invalid painting");
        Painting storage p = paintings[id];
        require(p.status == Status.Pending, "PaintVote: not pending");

        p.status = Status.Rejected;
        hasPendingSubmission[p.author] = false;

        emit PaintingRejected(id, p.author);
    }

    // ─── Write (submissions) ───────────────────────────────────────────────────

    /// @notice Add a new painting (pending until owner approves)
    function addPainting(string calldata uri) external {
        address author = msg.sender;
        _requireCanSubmit(author);

        uint256 id = paintings.length;
        paintings.push(Painting({uri: uri, author: author, status: Status.Pending}));
        hasPendingSubmission[author] = true;

        emit PaintingAdded(id, uri, author);
    }

    /// @notice Publish via NFC signature. Called by the relayer.
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

        _requireCanSubmit(signer);

        uint256 id = paintings.length;
        paintings.push(Painting({uri: uri, author: signer, status: Status.Pending}));
        hasPendingSubmission[signer] = true;

        emit PaintingAdded(id, uri, signer);
    }

    function _requireCanSubmit(address author) internal view {
        require(!hasPendingSubmission[author], "PaintVote: pending submission");
        require(!hasApprovedSubmission[author], "PaintVote: already approved");
    }

    // ─── Write (votes) ─────────────────────────────────────────────────────────

    /// @notice Cast a directional vote for an approved painting. Cannot vote for own work.
    function vote(uint256 paintingId, bool support) external {
        _vote(msg.sender, paintingId, support);
    }

    /// @notice Vote via NFC bracelet signature. Called by the relayer.
    /// @dev Message is 3 bytes: bytes 0-1 = painting ID (big-endian), byte 2 = 0x01 (support) or 0x00 (pass)
    function voteWithNfc(
        uint256 paintingId,
        bool support,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes32 hash,
        bytes calldata message
    ) external {
        require(paintingId < paintings.length, "PaintVote: invalid painting");
        require(_messageToHash(message) == hash, "PaintVote: invalid hash");

        address signer = ecrecover(hash, v, r, s);
        require(signer != address(0), "PaintVote: invalid signature");

        require(message.length >= 3, "PaintVote: message too short");
        uint256 decodedId = (uint256(uint8(message[0])) << 8) | uint256(uint8(message[1]));
        require(decodedId == paintingId, "PaintVote: id mismatch");
        bool decodedSupport = message[2] != 0x00;
        require(decodedSupport == support, "PaintVote: support mismatch");

        _vote(signer, paintingId, support);
    }

    function _vote(address voter, uint256 paintingId, bool support) internal {
        require(paintingId < paintings.length, "PaintVote: invalid painting");
        Painting storage p = paintings[paintingId];
        require(p.status == Status.Approved, "PaintVote: not approved");
        require(voter != p.author, "PaintVote: cannot vote own");
        require(!hasVoted[voter][paintingId] && !hasVotedNegative[voter][paintingId], "PaintVote: already voted");

        if (support) {
            hasVoted[voter][paintingId] = true;
            votes[paintingId] += 1;
        } else {
            hasVotedNegative[voter][paintingId] = true;
            negativeVotes[paintingId] += 1;
        }

        emit Voted(paintingId, voter, support);
    }

    /// @notice Vote on multiple approved paintings in one transaction via NFC signature.
    /// @dev Message = 3N bytes. Each group: bytes 0-1 = painting ID (big-endian), byte 2 = 0x01 (support) or 0x00 (pass).
    function batchVoteWithNfc(
        uint256[] calldata paintingIds,
        bool[]    calldata voteDirections,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes32 hash,
        bytes calldata message
    ) external {
        require(paintingIds.length == voteDirections.length, "PaintVote: length mismatch");
        require(message.length == paintingIds.length * 3, "PaintVote: message length mismatch");
        require(_messageToHash(message) == hash, "PaintVote: invalid hash");

        address signer = ecrecover(hash, v, r, s);
        require(signer != address(0), "PaintVote: invalid signature");

        for (uint256 i = 0; i < paintingIds.length; i++) {
            uint256 decodedId =
                (uint256(uint8(message[i * 3])) << 8) | uint256(uint8(message[i * 3 + 1]));
            require(decodedId == paintingIds[i], "PaintVote: id mismatch");
            bool decodedSupport = message[i * 3 + 2] != 0x00;
            require(decodedSupport == voteDirections[i], "PaintVote: support mismatch");
            _vote(signer, paintingIds[i], voteDirections[i]);
        }
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    /// @notice Total number of paintings (all statuses)
    function paintingCount() external view returns (uint256) {
        return paintings.length;
    }

    /// @notice Full entry for a painting id
    function getPainting(uint256 id)
        external
        view
        returns (string memory uri, address author, Status status)
    {
        require(id < paintings.length, "PaintVote: invalid painting");
        Painting storage p = paintings[id];
        return (p.uri, p.author, p.status);
    }

    // ─── Internal EIP-191 helpers ─────────────────────────────────────────────

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
}
