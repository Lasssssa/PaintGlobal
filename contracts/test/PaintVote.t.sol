// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PaintVote.sol";

contract PaintVoteTest is Test {
    PaintVote internal vote;
    address internal owner = address(0xBEEF);
    address internal author = address(0xA11CE);
    address internal voter = address(0xB0B);

    function setUp() public {
        vote = new PaintVote(owner);
    }

    function test_AddPainting_Pending() public {
        vm.prank(author);
        vote.addPainting("ipfs://meta");

        assertEq(vote.paintingCount(), 1);
        (string memory uri, address a, PaintVote.Status st) = vote.getPainting(0);
        assertEq(uri, "ipfs://meta");
        assertEq(a, author);
        assertEq(uint256(st), uint256(PaintVote.Status.Pending));
        assertTrue(vote.hasPendingSubmission(author));
        assertFalse(vote.hasApprovedSubmission(author));
    }

    function test_Vote_RevertsWhenPending() public {
        vm.prank(author);
        vote.addPainting("ipfs://a");

        vm.prank(voter);
        vm.expectRevert(bytes("PaintVote: not approved"));
        vote.vote(0, true);
    }

    function test_Approve_ThenVote_Positive() public {
        vm.prank(author);
        vote.addPainting("ipfs://a");

        vm.prank(owner);
        vote.approve(0);

        vm.prank(voter);
        vote.vote(0, true);
        assertEq(vote.votes(0), 1);
        assertEq(vote.negativeVotes(0), 0);
        assertTrue(vote.hasVoted(voter, 0));
        assertFalse(vote.hasVotedNegative(voter, 0));
    }

    function test_Approve_ThenVote_Negative() public {
        vm.prank(author);
        vote.addPainting("ipfs://a");

        vm.prank(owner);
        vote.approve(0);

        vm.prank(voter);
        vote.vote(0, false);
        assertEq(vote.votes(0), 0);
        assertEq(vote.negativeVotes(0), 1);
        assertFalse(vote.hasVoted(voter, 0));
        assertTrue(vote.hasVotedNegative(voter, 0));
    }

    function test_Vote_RevertsDoubleVote() public {
        vm.prank(author);
        vote.addPainting("ipfs://a");

        vm.prank(owner);
        vote.approve(0);

        vm.prank(voter);
        vote.vote(0, true);

        vm.prank(voter);
        vm.expectRevert(bytes("PaintVote: already voted"));
        vote.vote(0, false);
    }

    function test_Vote_RevertsForAuthor() public {
        vm.prank(author);
        vote.addPainting("ipfs://a");

        vm.prank(owner);
        vote.approve(0);

        vm.prank(author);
        vm.expectRevert(bytes("PaintVote: cannot vote own"));
        vote.vote(0, true);
    }

    function test_Reject_ThenAuthorCanSubmitAgain() public {
        vm.prank(author);
        vote.addPainting("ipfs://first");

        vm.prank(owner);
        vote.reject(0);

        assertFalse(vote.hasPendingSubmission(author));
        assertFalse(vote.hasApprovedSubmission(author));

        vm.prank(author);
        vote.addPainting("ipfs://second");
        assertEq(vote.paintingCount(), 2);
    }

    function test_CannotSubmitSecondWhilePending() public {
        vm.prank(author);
        vote.addPainting("ipfs://a");

        vm.prank(author);
        vm.expectRevert(bytes("PaintVote: pending submission"));
        vote.addPainting("ipfs://b");
    }

    function test_CannotSubmitAfterApproved() public {
        vm.prank(author);
        vote.addPainting("ipfs://a");

        vm.prank(owner);
        vote.approve(0);

        vm.prank(author);
        vm.expectRevert(bytes("PaintVote: already approved"));
        vote.addPainting("ipfs://b");
    }

    function test_OnlyOwnerApprove() public {
        vm.prank(author);
        vote.addPainting("ipfs://a");

        vm.prank(author);
        vm.expectRevert(bytes("PaintVote: not owner"));
        vote.approve(0);
    }

    function test_VoteWithNfc_Positive() public {
        vm.prank(author);
        vote.addPainting("ipfs://a");

        vm.prank(owner);
        vote.approve(0);

        // 3-byte message: paintingId=0, support=true (0x01)
        bytes memory message = hex"000001";
        bytes32 hash = _ethSignedMessageHash(message);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, hash);

        address signerAddr = vm.addr(1);
        assertTrue(signerAddr != author);

        vote.voteWithNfc(0, true, v, r, s, hash, message);
        assertEq(vote.votes(0), 1);
        assertTrue(vote.hasVoted(signerAddr, 0));
    }

    function test_VoteWithNfc_Negative() public {
        vm.prank(author);
        vote.addPainting("ipfs://a");

        vm.prank(owner);
        vote.approve(0);

        // 3-byte message: paintingId=0, support=false (0x00)
        bytes memory message = hex"000000";
        bytes32 hash = _ethSignedMessageHash(message);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, hash);

        address signerAddr = vm.addr(1);

        vote.voteWithNfc(0, false, v, r, s, hash, message);
        assertEq(vote.negativeVotes(0), 1);
        assertTrue(vote.hasVotedNegative(signerAddr, 0));
    }

    function test_VoteWithNfc_RevertsSupportMismatch() public {
        vm.prank(author);
        vote.addPainting("ipfs://a");

        vm.prank(owner);
        vote.approve(0);

        // Message says support=true (0x01) but caller passes support=false
        bytes memory message = hex"000001";
        bytes32 hash = _ethSignedMessageHash(message);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, hash);

        vm.expectRevert(bytes("PaintVote: support mismatch"));
        vote.voteWithNfc(0, false, v, r, s, hash, message);
    }

    function test_BatchVoteWithNfc() public {
        // Submit and approve 2 paintings
        vm.prank(author);
        vote.addPainting("ipfs://a");
        vm.prank(address(0xC0DE));
        vote.addPainting("ipfs://b");

        vm.prank(owner);
        vote.approve(0);
        vm.prank(owner);
        vote.approve(1);

        // Batch: paintingId=0 support, paintingId=1 pass
        // message = 000001 000100
        bytes memory message = hex"000001000100";
        bytes32 hash = _ethSignedMessageHash(message);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, hash);

        address signerAddr = vm.addr(1);
        assertTrue(signerAddr != author && signerAddr != address(0xC0DE));

        uint256[] memory ids = new uint256[](2);
        ids[0] = 0; ids[1] = 1;
        bool[] memory dirs = new bool[](2);
        dirs[0] = true; dirs[1] = false;

        vote.batchVoteWithNfc(ids, dirs, v, r, s, hash, message);

        assertEq(vote.votes(0), 1);
        assertEq(vote.negativeVotes(1), 1);
        assertTrue(vote.hasVoted(signerAddr, 0));
        assertTrue(vote.hasVotedNegative(signerAddr, 1));
    }

    function test_BatchVoteWithNfc_RevertsLengthMismatch() public {
        bytes memory message = hex"000001";
        bytes32 hash = _ethSignedMessageHash(message);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, hash);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;
        bool[] memory dirs = new bool[](2);
        dirs[0] = true; dirs[1] = false;

        vm.expectRevert(bytes("PaintVote: length mismatch"));
        vote.batchVoteWithNfc(ids, dirs, v, r, s, hash, message);
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
}
