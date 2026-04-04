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
        vote.vote(0);
    }

    function test_Approve_ThenVote() public {
        vm.prank(author);
        vote.addPainting("ipfs://a");

        vm.prank(owner);
        vote.approve(0);

        vm.prank(voter);
        vote.vote(0);
        assertEq(vote.votes(0), 1);
        assertTrue(vote.hasVoted(voter, 0));
    }

    function test_Vote_RevertsForAuthor() public {
        vm.prank(author);
        vote.addPainting("ipfs://a");

        vm.prank(owner);
        vote.approve(0);

        vm.prank(author);
        vm.expectRevert(bytes("PaintVote: cannot vote own"));
        vote.vote(0);
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

    function test_VoteWithNfc_SameRules() public {
        vm.prank(author);
        vote.addPainting("ipfs://a");

        vm.prank(owner);
        vote.approve(0);

        // message = big-endian uint16 paintingId 0
        bytes memory message = hex"0000";
        bytes32 hash = _ethSignedMessageHash(message);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, hash);

        address signerAddr = vm.addr(1);
        assertTrue(signerAddr != author);

        vote.voteWithNfc(0, v, r, s, hash, message);
        assertEq(vote.votes(0), 1);
        assertTrue(vote.hasVoted(signerAddr, 0));
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
