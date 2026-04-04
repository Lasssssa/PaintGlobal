// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PaintNFT.sol";

contract DeployPaintNFT is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address paintVote = vm.envAddress("PAINT_VOTE_ADDRESS");

        vm.startBroadcast(pk);
        PaintNFT nft = new PaintNFT(paintVote);
        vm.stopBroadcast();

        console.log("PaintNFT deployed at:", address(nft));
    }
}
