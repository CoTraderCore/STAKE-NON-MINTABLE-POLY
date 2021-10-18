// SPDX-License-Identifier: MIT
pragma solidity ^0.6.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";

contract Token is ERC20, ERC20Burnable {
    constructor(uint256 _initSupply) public ERC20("CoTrader", "COT") {
        _mint(msg.sender, _initSupply);
    }
}
