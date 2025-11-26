// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GuidedOracle {
    struct Outcome {
        bool isSet;
        bytes resultData;
        uint256 timestamp;
    }

    address public oracleBot;
    address public owner;

    mapping(string => Outcome) public outcomes;

    mapping(address => bool) public allowedTargets;
    mapping(bytes4 => bool) public allowedSelectors;

    event OutcomeSubmitted(string indexed marketId, bytes resultData, uint256 timestamp);
    event OutcomeCorrected(string indexed marketId, bytes resultData, uint256 timestamp);
    event OracleBotUpdated(address newBot);
    event CallExecuted(address indexed target, bytes data);
    event AllowedTargetUpdated(address indexed target, bool allowed);
    event AllowedSelectorUpdated(bytes4 indexed selector, bool allowed);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

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

    function submitOutcome(string memory marketId, bytes memory resultData) external onlyBot {
        require(!outcomes[marketId].isSet, "Outcome already submitted");
        outcomes[marketId] = Outcome({
            isSet: true,
            resultData: resultData,
            timestamp: block.timestamp
        });

        emit OutcomeSubmitted(marketId, resultData, block.timestamp);
    }

    function correctOutcome(string memory marketId, bytes memory resultData) external onlyOwner {
        outcomes[marketId] = Outcome({
            isSet: true,
            resultData: resultData,
            timestamp: block.timestamp
        });
        emit OutcomeCorrected(marketId, resultData, block.timestamp);
    }

    function executeCall(address target, bytes calldata data) external onlyBot {
        require(target != address(0), "Invalid target address");
        require(data.length >= 4, "Calldata too short");
        require(allowedTargets[target], "Target contract not whitelisted");
        
        bytes4 selector = bytes4(data[0:4]);
        require(allowedSelectors[selector], "Function selector not whitelisted");
        
        (bool success, bytes memory returnData) = target.call(data);
        
        if (!success) {
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

    function getOutcome(string memory marketId) external view returns (bool isSet, bytes memory resultData) {
        Outcome memory o = outcomes[marketId];
        return (o.isSet, o.resultData);
    }

    function updateOracleBot(address newBot) external onlyOwner {
        require(newBot != address(0), "Invalid bot address");
        oracleBot = newBot;
        emit OracleBotUpdated(newBot);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function setAllowedTarget(address target, bool allowed) external onlyOwner {
        require(target != address(0), "Invalid target address");
        allowedTargets[target] = allowed;
        emit AllowedTargetUpdated(target, allowed);
    }

    function setAllowedSelector(bytes4 selector, bool allowed) external onlyOwner {
        require(selector != bytes4(0), "Invalid selector");
        allowedSelectors[selector] = allowed;
        emit AllowedSelectorUpdated(selector, allowed);
    }

    function batchSetAllowedTargets(address[] calldata targets, bool allowed) external onlyOwner {
        require(targets.length <= 100, "Batch too large");
        for (uint256 i = 0; i < targets.length; i++) {
            require(targets[i] != address(0), "Invalid target address");
            allowedTargets[targets[i]] = allowed;
            emit AllowedTargetUpdated(targets[i], allowed);
        }
    }
}
