// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSD
 * @notice Demonstration 6-decimal ERC20 token for HSK Testnet hackathon testing.
 * Has no monetary value and is not official USDC/USDT.
 */
contract MockUSD is ERC20 {
    uint8 private immutable _decimals;

    constructor() ERC20("Mock USD", "mUSD") {
        _decimals = 6;
        // Mint 1,000,000 mUSD to deployer for testing and faucet distribution
        _mint(msg.sender, 1_000_000 * 10 ** 6);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
