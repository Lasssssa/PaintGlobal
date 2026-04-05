// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PaintAuction.sol";

contract DeployPaintAuction is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        PaintAuction auction = new PaintAuction();
        vm.stopBroadcast();

        console.log("PaintAuction deployed at:", address(auction));
    }
}
