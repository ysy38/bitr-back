// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BitredictToken is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 100_000_000 * 1e18; // 100M BITR
    bool public mintingFinished = true; // No future minting allowed
    
    constructor() ERC20("Bitredict", "BITR") Ownable(msg.sender) {
        // Mint entire supply to deployer
        _mint(msg.sender, MAX_SUPPLY);
    }
    
    // Override mint to prevent any future minting
    function mint(address, uint256) public pure {
        revert("Minting is permanently disabled");
    }
    
    // View function to confirm no minting capability
    function canMint() public pure returns (bool) {
        return false;
    }
    
    // Total supply is fixed and cannot change
    function maxSupply() public pure returns (uint256) {
        return MAX_SUPPLY;
    }
} 