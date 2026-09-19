// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * TEST-ONLY hostile tokens used by the Hardhat suite. Never deploy these to a live network
 * and never use them as an agreement token outside tests.
 */

/// @dev Burns 1% of every transfer between two non-zero accounts (fee-on-transfer behaviour).
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

/// @dev Reverts when transferring to a blocked recipient (simulates a blacklisting stablecoin).
contract BlockableToken is ERC20 {
    mapping(address => bool) public blocked;

    constructor() ERC20("Blockable Token", "BLK") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool value) external {
        blocked[account] = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[to], "Blocked recipient");
        super._update(from, to, value);
    }
}

/// @dev On the first outgoing transfer from `target`, calls back into `target` with `payload`
/// and records whether the reentrant call succeeded and what it returned.
contract ReentrantToken is ERC20 {
    address public target;
    bytes public payload;
    bool public armed;
    bool public attempted;
    bool public reentrySucceeded;
    bytes public reentryReturnData;

    constructor() ERC20("Reentrant Token", "RE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address _target, bytes calldata _payload) external {
        target = _target;
        payload = _payload;
        armed = true;
        attempted = false;
        reentrySucceeded = false;
        delete reentryReturnData;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (armed && !attempted && from == target && from != address(0)) {
            attempted = true;
            (bool ok, bytes memory ret) = target.call(payload);
            reentrySucceeded = ok;
            reentryReturnData = ret;
        }
        super._update(from, to, value);
    }
}
