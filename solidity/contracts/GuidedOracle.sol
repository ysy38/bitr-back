// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GuidedOracle {
    // Outcome structure for football/coin markets
    struct Outcome {
        bool isSet;            // True if outcome has been submitted
        bytes resultData;      // Generic outcome data (can be "1", "2", "over", etc.)
        uint256 timestamp;     // When the outcome was written
    }

    // Only the authorized bot (off-chain oracle service) can write outcomes
    address public oracleBot;
    address public owner;

    // mapping from external ID (e.g. Sportmonks match ID, coin symbol hash) to outcome
    mapping(string => Outcome) public outcomes;

    // Security: Whitelist of allowed target contracts for executeCall
    mapping(address => bool) public allowedTargets;
    // Security: Whitelist of allowed function selectors (first 4 bytes of function signature)
    mapping(bytes4 => bool) public allowedSelectors;

    // Events
    event OutcomeSubmitted(string indexed marketId, bytes resultData, uint256 timestamp);
    event OracleBotUpdated(address newBot);
    event CallExecuted(address indexed target, bytes data);
    event AllowedTargetUpdated(address indexed target, bool allowed);
    event AllowedSelectorUpdated(bytes4 indexed selector, bool allowed);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyBot() {
        require(msg.sender == oracleBot, "Only oracle bot can submit outcome");
        _;
    }

    constructor(address _oracleBot) {
        oracleBot = _oracleBot;
        owner = msg.sender;
    }

    // Submit the final outcome for a guided market
    function submitOutcome(string memory marketId, bytes memory resultData) external onlyBot {
        require(!outcomes[marketId].isSet, "Outcome already submitted");
        outcomes[marketId] = Outcome({
            isSet: true,
            resultData: resultData,
            timestamp: block.timestamp
        });

        emit OutcomeSubmitted(marketId, resultData, block.timestamp);
    }

    /**
     * @notice Allows the oracle bot to execute a call to another contract.
     * @dev This is used for pushing data to consumer contracts like PoolCore,
     * which require the oracle to initiate the data push. The `msg.sender` on
     * the target contract will be this GuidedOracle contract.
     * SECURITY: Only whitelisted targets and function selectors are allowed.
     * @param target The address of the contract to call (must be whitelisted).
     * @param data The calldata for the function to be executed (selector must be whitelisted).
     */
    function executeCall(address target, bytes calldata data) external onlyBot {
        require(target != address(0), "Invalid target address");
        require(data.length >= 4, "Calldata too short");
        require(allowedTargets[target], "Target contract not whitelisted");
        
        // Extract function selector (first 4 bytes)
        bytes4 selector = bytes4(data[0:4]);
        require(allowedSelectors[selector], "Function selector not whitelisted");
        
        (bool success, bytes memory returnData) = target.call(data);
        
        if (!success) {
            // Try to decode the revert reason
            if (returnData.length > 0) {
                assembly {
                    let returnDataSize := mload(returnData)
                    revert(add(32, returnData), returnDataSize)
                }
            } else {
                revert("External call failed");
            }
        }
        
        emit CallExecuted(target, data);
    }

    // View function to fetch result
    function getOutcome(string memory marketId) external view returns (bool isSet, bytes memory resultData) {
        Outcome memory o = outcomes[marketId];
        return (o.isSet, o.resultData);
    }

    // Update bot address if needed
    function updateOracleBot(address newBot) external onlyOwner {
        require(newBot != address(0), "Invalid bot address");
        oracleBot = newBot;
        emit OracleBotUpdated(newBot);
    }

    /**
     * @notice Add or remove allowed target contracts for executeCall
     * @param target The contract address to whitelist/blacklist
     * @param allowed Whether the target is allowed
     */
    function setAllowedTarget(address target, bool allowed) external onlyOwner {
        require(target != address(0), "Invalid target address");
        allowedTargets[target] = allowed;
        emit AllowedTargetUpdated(target, allowed);
    }

    /**
     * @notice Add or remove allowed function selectors for executeCall
     * @param selector The function selector (first 4 bytes of function signature)
     * @param allowed Whether the selector is allowed
     */
    function setAllowedSelector(bytes4 selector, bool allowed) external onlyOwner {
        require(selector != bytes4(0), "Invalid selector");
        allowedSelectors[selector] = allowed;
        emit AllowedSelectorUpdated(selector, allowed);
    }

    /**
     * @notice Batch update allowed targets
     * @param targets Array of target addresses
     * @param allowed Whether all targets should be allowed
     */
    function batchSetAllowedTargets(address[] calldata targets, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < targets.length; i++) {
            require(targets[i] != address(0), "Invalid target address");
            allowedTargets[targets[i]] = allowed;
            emit AllowedTargetUpdated(targets[i], allowed);
        }
    }
}
