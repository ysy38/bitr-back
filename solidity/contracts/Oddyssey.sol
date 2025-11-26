// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IReputationSystem {
    enum ReputationAction {
        POOL_CREATED,
        BET_PLACED,
        BET_WON,
        BET_WON_HIGH_VALUE,
        BET_WON_MASSIVE,
        POOL_FILLED_ABOVE_60,
        POOL_SPAMMED,
        OUTCOME_PROPOSED_CORRECTLY,
        OUTCOME_PROPOSED_INCORRECTLY,
        CHALLENGE_SUCCESSFUL,
        CHALLENGE_FAILED,
        LIQUIDITY_PROVIDED,
        LIQUIDITY_REMOVED,
        SOCIAL_ENGAGEMENT,
        COMMUNITY_CONTRIBUTION,
        SPAM_DETECTED,
        ABUSE_DETECTED,
        VERIFICATION_GRANTED,
        VERIFICATION_REVOKED,
        ODDYSSEY_PARTICIPATION,
        ODDYSSEY_QUALIFYING,
        ODDYSSEY_EXCELLENT,
        ODDYSSEY_OUTSTANDING,
        ODDYSSEY_PERFECT,
        ODDYSSEY_WINNER,
        ODDYSSEY_CHAMPION
    }
    
    function recordReputationAction(address user, ReputationAction action, string memory details) external;
}

contract Oddyssey is Ownable, ReentrancyGuard {
    uint256 public constant DAILY_LEADERBOARD_SIZE = 5;
    uint256 public constant MATCH_COUNT = 10;
    uint256 public constant ODDS_SCALING_FACTOR = 1000;
    uint256 public constant MIN_CORRECT_PREDICTIONS = 7;
    uint256 public constant MAX_CYCLES_TO_RESOLVE = 50;
    uint256 public immutable DEV_FEE_PERCENTAGE;
    uint256 public immutable PRIZE_ROLLOVER_FEE_PERCENTAGE;

    enum BetType { MONEYLINE, OVER_UNDER }
    enum MoneylineResult { NotSet, HomeWin, Draw, AwayWin }
    enum OverUnderResult { NotSet, Over, Under }
    enum CycleState { NotStarted, Active, Ended, Resolved }

    struct Result {
        MoneylineResult moneyline;
        OverUnderResult overUnder;
    }

    struct Match {
        uint64 id;
        uint64 startTime;
        uint32 oddsHome;
        uint32 oddsDraw;
        uint32 oddsAway;
        uint32 oddsOver;
        uint32 oddsUnder;
        string homeTeam;
        string awayTeam;
        string leagueName;
        Result result;
    }

    struct UserPrediction {
        uint64 matchId;
        BetType betType;
        string selection;
        uint32 selectedOdd;
        string homeTeam;
        string awayTeam;
        string leagueName;
    }

    struct Slip {
        address player;
        uint256 cycleId;
        uint256 placedAt;
        UserPrediction[MATCH_COUNT] predictions;
        uint256 finalScore;
        uint8 correctCount;
        bool isEvaluated;
    }

    struct LeaderboardEntry {
        address player;
        uint256 slipId;
        uint256 finalScore;
        uint8 correctCount;
    }

    struct GlobalStats {
        uint256 totalVolume;
        uint32 totalSlips;
        uint256 highestOdd;
    }

    struct DailyStats {
        uint256 slipCount;
        uint256 userCount;
        uint256 volume;
        uint256 correctPredictions;
        uint256 evaluatedSlips;
        uint256 averageScore;
        uint256 maxScore;
        uint256 minScore;
        uint256 winnersCount;
    }

    struct CycleStats {
        uint256 volume;
        uint32 slips;
        uint32 evaluatedSlips;
    }

    struct CycleInfo {
        uint256 startTime;
        uint256 endTime;
        uint256 prizePool;
        uint32 slipCount;
        uint32 evaluatedSlips;
        CycleState state;
        bool hasWinner;
    }



    struct UserStats {
        uint256 totalSlips;
        uint256 totalWins;
        uint256 bestScore;
        uint256 averageScore;
        uint256 winRate;
        uint256 currentStreak;
        uint256 bestStreak;
        uint256 lastActiveCycle;
    }

    address public oracle;
    address public immutable devWallet;
    uint256 public entryFee;
    uint256 public dailyCycleId;
    uint256 public slipCount;
    
    IReputationSystem public reputationSystem;

    mapping(address => UserStats) public userStats;
    
    mapping(address => uint256) public userOddysseyReputation;
    mapping(address => uint256) public userOddysseyCorrectPredictions;

    mapping(uint256 => Match[MATCH_COUNT]) public dailyMatches;
    mapping(uint256 => uint256) public dailyCycleEndTimes;
    mapping(uint256 => uint256) public claimableStartTimes;
    mapping(uint256 => uint256) public dailyPrizePools;
    mapping(uint256 => CycleStats) public cycleStats;
    mapping(uint256 => CycleInfo) public cycleInfo;

    mapping(uint256 => Slip) public slips;
    mapping(uint256 => mapping(address => uint256[])) private s_userSlipsPerCycle;
    mapping(address => uint256[]) private s_userSlips;
    mapping(uint256 => LeaderboardEntry[DAILY_LEADERBOARD_SIZE]) public dailyLeaderboards;
    mapping(uint256 => bool) public isCycleResolved;
    mapping(uint256 => mapping(uint8 => bool)) public prizeClaimed;

    mapping(uint256 => uint256) public dailySlipCount;
    mapping(uint256 => uint256) public dailyUserCount;
    mapping(uint256 => uint256) public dailyVolume;
    mapping(uint256 => uint256) public dailyCorrectPredictions;
    mapping(uint256 => uint256) public dailyEvaluatedSlips;
    mapping(uint256 => uint256) public dailyAverageScore;
    mapping(uint256 => uint256) public dailyMaxScore;
    mapping(uint256 => uint256) public dailyMinScore;
    mapping(uint256 => uint256) public dailyWinnersCount;

    GlobalStats public stats;

    event OracleSet(address indexed newOracle);
    event EntryFeeSet(uint256 indexed newFee);
    event CycleStarted(uint256 indexed cycleId, uint256 endTime);
    event SlipPlaced(uint256 indexed cycleId, address indexed player, uint256 indexed slipId);
    event SlipEvaluated(uint256 indexed slipId, address indexed player, uint256 indexed cycleId, uint8 correctCount, uint256 finalScore);
    event CycleEnded(uint256 indexed cycleId, uint256 endTime, uint32 totalSlips);
    event CycleResolved(uint256 indexed cycleId, uint256 prizePool);
    event LeaderboardUpdated(uint256 indexed cycleId, address indexed player, uint256 indexed slipId, uint8 rank, uint256 finalScore);
    event AnalyticsUpdated(uint256 indexed cycleId, uint256 totalVolume, uint32 totalSlips, uint256 averageScore);
    event PrizeClaimed(uint256 indexed cycleId, address indexed player, uint256 indexed slipId, uint256 rank, uint256 amount);
    event PrizeRollover(uint256 indexed fromCycleId, uint256 indexed toCycleId, uint256 amount);
    event UserStatsUpdated(address indexed user, uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 winRate);
    event OddysseyReputationUpdated(address indexed user, uint256 pointsEarned, uint256 correctPredictions, uint256 totalReputation);
    event ReputationActionOccurred(address indexed user, IReputationSystem.ReputationAction action, uint256 value, bytes32 indexed cycleId, uint256 timestamp);
    error Unauthorized();
    error InvalidInput();
    error InvalidState();
    error InsufficientFunds();
    error InvalidTiming();
    error DataNotFound();
    error TransferFailed();

    modifier onlyOracle() {
        if (msg.sender != oracle) revert Unauthorized();
        _;
    }
    
    modifier validCycleId(uint256 _cycleId) {
        if (_cycleId == 0 || _cycleId > dailyCycleId) revert DataNotFound();
        _;
    }
    
    modifier cycleExists(uint256 _cycleId) {
        if (cycleInfo[_cycleId].startTime == 0) revert DataNotFound();
        _;
    }
    
    modifier cycleActive(uint256 _cycleId) {
        if (cycleInfo[_cycleId].state != CycleState.Active) revert InvalidState();
        _;
    }
    
    modifier cycleResolved(uint256 _cycleId) {
        if (cycleInfo[_cycleId].state != CycleState.Resolved) revert InvalidState();
        _;
    }
    
    modifier bettingOpen(uint256 _cycleId) {
        CycleInfo storage cycle = cycleInfo[_cycleId];
        if (cycle.state != CycleState.Active) revert InvalidState();
        if (block.timestamp >= cycle.endTime) revert InvalidTiming();
        _;
    }
    
    modifier validPayment() {
        if (msg.value != entryFee) revert InsufficientFunds();
        _;
    }
    
    modifier validSlipId(uint256 _slipId) {
        if (_slipId >= slipCount) revert DataNotFound();
        _;
    }




    constructor(address _devWallet, uint256 _initialEntryFee) Ownable(msg.sender) {
        if (_devWallet == address(0)) revert InvalidInput();
        require(_initialEntryFee > 0, "Fee must be positive");
        
        devWallet = _devWallet;
        entryFee = _initialEntryFee;
        oracle = msg.sender;
        DEV_FEE_PERCENTAGE = 500;
        PRIZE_ROLLOVER_FEE_PERCENTAGE = 500;
    }


    function setOracle(address _newOracle) external onlyOwner {
        if (_newOracle == address(0)) revert InvalidInput();
        if (_newOracle == oracle) revert InvalidInput();
        oracle = _newOracle;
        emit OracleSet(_newOracle);
    }

    function setReputationSystem(address _reputationSystem) external onlyOwner {
        require(_reputationSystem != address(0), "Invalid reputation system address");
        reputationSystem = IReputationSystem(_reputationSystem);
    }

    function setEntryFee(uint256 _newFee) external onlyOwner {
        require(_newFee > 0, "Fee must be positive");
        require(_newFee != entryFee, "Fee unchanged");
        entryFee = _newFee;
        emit EntryFeeSet(_newFee);
    }




    function startDailyCycle(Match[MATCH_COUNT] memory _matches) external onlyOracle {
        uint64 earliestStartTime = type(uint64).max;
        
        mapping(uint64 => bool) memory seen;
        for (uint i = 0; i < MATCH_COUNT; i++) {
            Match memory matchData = _matches[i];
            
            if (matchData.id == 0) revert DataNotFound();
            if (matchData.startTime <= block.timestamp + 300) revert InvalidTiming();
            if (matchData.oddsHome == 0 || matchData.oddsDraw == 0 || matchData.oddsAway == 0) revert InvalidInput();
            if (matchData.oddsOver == 0 || matchData.oddsUnder == 0) revert InvalidInput();
            
            require(!seen[matchData.id], "Duplicate match");
            seen[matchData.id] = true;
            
            if (matchData.startTime < earliestStartTime) {
                earliestStartTime = matchData.startTime;
            }
        }
        
        if (earliestStartTime <= block.timestamp + 300) revert InvalidTiming();

        dailyCycleId++;
        uint256 cycle = dailyCycleId;

        _handlePrizeRollover(cycle - 1);

        uint256 bettingDeadline = earliestStartTime - 300;

        Match[MATCH_COUNT] storage cycleMatches = dailyMatches[cycle];
        for (uint i = 0; i < MATCH_COUNT; i++) {
            cycleMatches[i] = _matches[i];
        }
        dailyCycleEndTimes[cycle] = bettingDeadline;
        claimableStartTimes[cycle] = type(uint256).max;
        isCycleResolved[cycle] = false;

        cycleInfo[cycle] = CycleInfo({
            startTime: block.timestamp,
            endTime: bettingDeadline,
            prizePool: 0,
            slipCount: 0,
            evaluatedSlips: 0,
            state: CycleState.Active,
            hasWinner: false
        });

        emit CycleStarted(cycle, bettingDeadline);
    }

    function resolveDailyCycle(uint256 _cycleId, Result[MATCH_COUNT] memory _results) 
        public 
        onlyOracle 
        validCycleId(_cycleId)
        cycleExists(_cycleId)
    {
        CycleInfo storage cycle = cycleInfo[_cycleId];
        
        if (cycle.state == CycleState.Resolved) revert InvalidState();
        if (block.timestamp <= cycle.endTime) revert InvalidTiming();

        for (uint i = 0; i < MATCH_COUNT; i++) {
            dailyMatches[_cycleId][i].result = _results[i];
        }

        cycle.state = CycleState.Resolved;
        isCycleResolved[_cycleId] = true;
        
        if (cycle.slipCount == 0) {
            claimableStartTimes[_cycleId] = block.timestamp;
        } else {
            claimableStartTimes[_cycleId] = block.timestamp + 24 hours;
        }

        emit CycleResolved(_cycleId, dailyPrizePools[_cycleId]);
    }

    function resolveMultipleCycles(
        uint256[] memory _cycleIds,
        Result[MATCH_COUNT][] memory _results
    ) external onlyOracle {
        if (_cycleIds.length != _results.length) revert InvalidInput();
        if (_cycleIds.length > MAX_CYCLES_TO_RESOLVE) revert InvalidInput();
        
        for (uint i = 0; i < _cycleIds.length; i++) {
            resolveDailyCycle(_cycleIds[i], _results[i]);
        }
    }


    function placeSlip(UserPrediction[MATCH_COUNT] memory _predictions) external payable nonReentrant {
        uint256 cycle = dailyCycleId;
        if (cycle == 0) revert InvalidState();
        
        CycleInfo storage currentCycleInfo = cycleInfo[cycle];
        if (currentCycleInfo.state != CycleState.Active) revert InvalidState();
        if (block.timestamp >= currentCycleInfo.endTime) revert InvalidTiming();

        if (msg.value != entryFee) revert InsufficientFunds();

        Match[MATCH_COUNT] storage currentMatches = dailyMatches[cycle];

        bytes32 hash1 = keccak256(bytes("1"));
        bytes32 hashX = keccak256(bytes("X"));
        bytes32 hash2 = keccak256(bytes("2"));
        bytes32 hashOver = keccak256(bytes("Over"));
        bytes32 hashUnder = keccak256(bytes("Under"));

        for (uint i = 0; i < MATCH_COUNT; i++) {
            UserPrediction memory p = _predictions[i];
            if (p.matchId != currentMatches[i].id) revert InvalidInput();
            Match memory m = currentMatches[i];

            bytes32 selectionHash = keccak256(bytes(p.selection));
            
            uint32 odd;
            if (p.betType == BetType.MONEYLINE) {
                if (selectionHash == hash1) odd = m.oddsHome;
                else if (selectionHash == hashX) odd = m.oddsDraw;
                else if (selectionHash == hash2) odd = m.oddsAway;
                else revert InvalidInput();
            } else if (p.betType == BetType.OVER_UNDER) {
                if (selectionHash == hashOver) odd = m.oddsOver;
                else if (selectionHash == hashUnder) odd = m.oddsUnder;
                else revert InvalidInput();
            } else {
                revert InvalidInput();
            }
            if (odd == 0) revert InvalidInput();
            if (p.selectedOdd != odd) revert InvalidInput();
        }

        uint256 slipId = slipCount;
        Slip storage newSlip = slips[slipId];
        newSlip.player = msg.sender;
        newSlip.cycleId = cycle;
        newSlip.placedAt = block.timestamp;
        newSlip.finalScore = 0;
        newSlip.correctCount = 0;
        newSlip.isEvaluated = false;
        for (uint i = 0; i < MATCH_COUNT; i++) {
            newSlip.predictions[i] = UserPrediction({
                matchId: _predictions[i].matchId,
                betType: _predictions[i].betType,
                selection: _predictions[i].selection,
                selectedOdd: _predictions[i].selectedOdd,
                homeTeam: currentMatches[i].homeTeam,
                awayTeam: currentMatches[i].awayTeam,
                leagueName: currentMatches[i].leagueName
            });
        }
        slipCount++;

        s_userSlipsPerCycle[cycle][msg.sender].push(slipId);
        s_userSlips[msg.sender].push(slipId);
        dailyPrizePools[cycle] += msg.value;
        
        stats.totalVolume += msg.value;
        stats.totalSlips++;
        cycleStats[cycle].volume += msg.value;
        cycleStats[cycle].slips++;
        currentCycleInfo.prizePool += msg.value;
        currentCycleInfo.slipCount++;
        
        dailySlipCount[cycle]++;
        dailyVolume[cycle] += msg.value;
        
        if (s_userSlipsPerCycle[cycle][msg.sender].length == 1) {
            dailyUserCount[cycle]++;
        }
        
        _updateUserStats(msg.sender, cycle, true);
        
        
        emit SlipPlaced(cycle, msg.sender, slipId);
        
        if (address(reputationSystem) != address(0)) {
            emit ReputationActionOccurred(msg.sender, IReputationSystem.ReputationAction.ODDYSSEY_PARTICIPATION, 0, bytes32(cycle), block.timestamp);
        }
    }

    function evaluateSlip(uint256 _slipId) external nonReentrant validSlipId(_slipId) {
        _evaluateSlipInternal(_slipId);
    }

    function _evaluateSlipInternal(uint256 _slipId) internal {
        Slip storage slip = slips[_slipId];
        uint256 cycleIdOfSlip = slip.cycleId;
        
        if (cycleInfo[cycleIdOfSlip].startTime == 0) revert DataNotFound();
        if (cycleInfo[cycleIdOfSlip].state != CycleState.Resolved) revert InvalidState();
        if (slip.isEvaluated) revert InvalidState();
        
        uint8 correctCount = 0;
        uint256 score = ODDS_SCALING_FACTOR;
        Match[MATCH_COUNT] storage currentMatches = dailyMatches[cycleIdOfSlip];

        bytes32 hash1 = keccak256(bytes("1"));
        bytes32 hashX = keccak256(bytes("X"));
        bytes32 hash2 = keccak256(bytes("2"));
        bytes32 hashOver = keccak256(bytes("Over"));
        bytes32 hashUnder = keccak256(bytes("Under"));

        for(uint i = 0; i < MATCH_COUNT; i++) {
            UserPrediction memory p = slip.predictions[i];
            Match memory m = currentMatches[i];
            bool isCorrect = false;

            bytes32 selectionHash = keccak256(bytes(p.selection));
            if (p.betType == BetType.MONEYLINE) {
                if ((selectionHash == hash1 && m.result.moneyline == MoneylineResult.HomeWin) ||
                    (selectionHash == hashX && m.result.moneyline == MoneylineResult.Draw) ||
                    (selectionHash == hash2 && m.result.moneyline == MoneylineResult.AwayWin)) {
                    isCorrect = true;
                }
            } else {
                if ((selectionHash == hashOver && m.result.overUnder == OverUnderResult.Over) ||
                    (selectionHash == hashUnder && m.result.overUnder == OverUnderResult.Under)) {
                    isCorrect = true;
                }
            }

            if (isCorrect) {
                correctCount++;
                uint256 newScore = (score * p.selectedOdd) / ODDS_SCALING_FACTOR;
                require(newScore >= score || p.selectedOdd < ODDS_SCALING_FACTOR, "Score overflow");
                score = newScore;
            }
        }

        slip.correctCount = correctCount;
        slip.isEvaluated = true;
        slip.finalScore = (correctCount > 0) ? score : 0;

        _updateLeaderboard(cycleIdOfSlip, slip.player, _slipId, slip.finalScore, correctCount);
        
        _updateUserStats(slip.player, cycleIdOfSlip, false);
        
        CycleStats storage statsForCycle = cycleStats[cycleIdOfSlip];
        CycleInfo storage cycle = cycleInfo[cycleIdOfSlip];
        
        statsForCycle.evaluatedSlips++;
        cycle.evaluatedSlips++;
        
        dailyEvaluatedSlips[cycleIdOfSlip]++;
        dailyCorrectPredictions[cycleIdOfSlip] += correctCount;
        
        if (slip.finalScore > 0) {
            if (dailyMaxScore[cycleIdOfSlip] == 0 || slip.finalScore > dailyMaxScore[cycleIdOfSlip]) {
                dailyMaxScore[cycleIdOfSlip] = slip.finalScore;
            }
            if (dailyMinScore[cycleIdOfSlip] == 0 || slip.finalScore < dailyMinScore[cycleIdOfSlip]) {
                dailyMinScore[cycleIdOfSlip] = slip.finalScore;
            }
        }
        
        if (correctCount >= MIN_CORRECT_PREDICTIONS) {
            dailyWinnersCount[cycleIdOfSlip]++;
        }
        
        if (address(reputationSystem) != address(0)) {
            if (correctCount >= 7) {
                emit ReputationActionOccurred(slip.player, IReputationSystem.ReputationAction.ODDYSSEY_QUALIFYING, correctCount, bytes32(cycleIdOfSlip), block.timestamp);
            }
            if (correctCount >= 8) {
                emit ReputationActionOccurred(slip.player, IReputationSystem.ReputationAction.ODDYSSEY_EXCELLENT, correctCount, bytes32(cycleIdOfSlip), block.timestamp);
            }
            if (correctCount >= 9) {
                emit ReputationActionOccurred(slip.player, IReputationSystem.ReputationAction.ODDYSSEY_OUTSTANDING, correctCount, bytes32(cycleIdOfSlip), block.timestamp);
            }
            if (correctCount == 10) {
                emit ReputationActionOccurred(slip.player, IReputationSystem.ReputationAction.ODDYSSEY_PERFECT, correctCount, bytes32(cycleIdOfSlip), block.timestamp);
            }
        }
        
        if (statsForCycle.evaluatedSlips == statsForCycle.slips) {
            claimableStartTimes[cycleIdOfSlip] = block.timestamp;
        }
    }

    function claimPrize(uint256 _cycleId, uint256 _slipId) external nonReentrant validSlipId(_slipId) {
        _claimPrizeInternal(_cycleId, _slipId, msg.sender);
    }

    function _claimPrizeInternal(uint256 _cycleId, uint256 _slipId, address _claimant) internal {
        if (cycleInfo[_cycleId].state != CycleState.Resolved) revert InvalidState();
        if (block.timestamp < claimableStartTimes[_cycleId]) revert InvalidTiming();
        
        Slip storage slip = slips[_slipId];
        if (slip.player != _claimant) revert Unauthorized();
        if (slip.cycleId != _cycleId) revert InvalidInput();
        if (!slip.isEvaluated) revert InvalidState();
        
        LeaderboardEntry[DAILY_LEADERBOARD_SIZE] storage leaderboard = dailyLeaderboards[_cycleId];
        uint8 rank = 0;
        bool playerFound = false;

        for (uint8 i = 0; i < DAILY_LEADERBOARD_SIZE; i++) {
            if (leaderboard[i].player == _claimant && leaderboard[i].slipId == _slipId) {
                rank = i;
                playerFound = true;
                break;
            }
        }

        if (!playerFound) revert DataNotFound();

        if (prizeClaimed[_cycleId][rank]) revert InvalidState();

        uint256 prizeAmount = _calculatePrize(rank, dailyPrizePools[_cycleId]);
        if (prizeAmount == 0) {
            prizeClaimed[_cycleId][rank] = true;
            return;
        }

        prizeClaimed[_cycleId][rank] = true;

        uint256 devFee = (prizeAmount * DEV_FEE_PERCENTAGE) / 10000;
        uint256 userShare = prizeAmount - devFee;
        
        (bool success1, ) = payable(devWallet).call{value: devFee, gas: 2300}("");
        if (!success1) revert TransferFailed();
        
        (bool success2, ) = payable(msg.sender).call{value: userShare, gas: 2300}("");
        if (!success2) revert TransferFailed();

        emit PrizeClaimed(_cycleId, msg.sender, _slipId, rank, userShare);
        
        if (address(reputationSystem) != address(0)) {
            emit ReputationActionOccurred(msg.sender, IReputationSystem.ReputationAction.ODDYSSEY_WINNER, userShare, bytes32(_cycleId), block.timestamp);
        }
    }


    function getDailyMatches(uint256 _cycleId) external view returns (Match[MATCH_COUNT] memory) {
        return dailyMatches[_cycleId];
    }

    function getDailyLeaderboard(uint256 _cycleId) external view returns (LeaderboardEntry[DAILY_LEADERBOARD_SIZE] memory) {
        return dailyLeaderboards[_cycleId];
    }

    function getUserSlipsForCycle(address _user, uint256 _cycleId) external view returns (uint256[] memory) {
        return s_userSlipsPerCycle[_cycleId][_user];
    }

    function getUserSlipCount(address _user) external view returns (uint256) {
        return s_userSlips[_user].length;
    }

    function getSlip(uint256 _slipId) external view returns (Slip memory) {
        return slips[_slipId];
    }
    
    function getBatchSlips(uint256[] calldata _slipIds) external view returns (Slip[] memory) {
        Slip[] memory result = new Slip[](_slipIds.length);
        for (uint256 i = 0; i < _slipIds.length; i++) {
            result[i] = slips[_slipIds[i]];
        }
        return result;
    }
    
    function getUserSlipsWithData(address _user, uint256 _cycleId) external view returns (
        uint256[] memory slipIds,
        Slip[] memory slipsData
    ) {
        slipIds = s_userSlipsPerCycle[_cycleId][_user];
        slipsData = new Slip[](slipIds.length);
        for (uint256 i = 0; i < slipIds.length; i++) {
            slipsData[i] = slips[slipIds[i]];
        }
    }


    function getUserData(address _user) external view returns (
        UserStats memory userStatsData,
        uint256 reputation,
        uint256 correctPredictions
    ) {
        return (
            userStats[_user],
            userOddysseyReputation[_user],
            userOddysseyCorrectPredictions[_user]
        );
    }

    function getCurrentCycleInfo() external view returns (
        uint256 cycleId,
        uint8 state,
        uint256 endTime,
        uint256 prizePool,
        uint32 cycleSlipCount
    ) {
        cycleId = dailyCycleId;
        if (cycleId > 0) {
            CycleInfo memory info = cycleInfo[cycleId];
            return (cycleId, uint8(info.state), info.endTime, info.prizePool, info.slipCount);
        }
        return (0, 0, 0, 0, 0);
    }

    function getCycleStatus(uint256 _cycleId) external view returns (
        bool exists,
        uint8 state,
        uint256 endTime,
        uint256 prizePool,
        uint32 cycleSlipCount,
        bool hasWinner
    ) {
        if (_cycleId == 0 || _cycleId > dailyCycleId) {
            return (false, 0, 0, 0, 0, false);
        }
        
        CycleInfo memory info = cycleInfo[_cycleId];
        return (
            info.startTime > 0,
            uint8(info.state),
            info.endTime,
            info.prizePool,
            info.slipCount,
            info.hasWinner
        );
    }


    function evaluateMultipleSlips(uint256[] memory _slipIds) external {
        for (uint256 i = 0; i < _slipIds.length; i++) {
            _evaluateSlipInternal(_slipIds[i]);
        }
    }

    function claimMultiplePrizes(uint256[] memory _cycleIds, uint256[] memory _slipIds) external {
        if (_cycleIds.length != _slipIds.length) revert InvalidInput();
        
        for (uint256 i = 0; i < _cycleIds.length; i++) {
            _claimPrizeInternal(_cycleIds[i], _slipIds[i], msg.sender);
        }
    }



    function _updateLeaderboard(uint256 _cycleId, address _player, uint256 _slipId, uint256 _finalScore, uint8 _correctCount) private {
        if (_correctCount < MIN_CORRECT_PREDICTIONS) return;
        
        if (_slipId >= slipCount) return;
        Slip storage slip = slips[_slipId];
        if (slip.cycleId != _cycleId || slip.player != _player) return;

        LeaderboardEntry[DAILY_LEADERBOARD_SIZE] storage leaderboard = dailyLeaderboards[_cycleId];
        
        int256 existingPosition = -1;
        for (uint256 i = 0; i < DAILY_LEADERBOARD_SIZE; i++) {
            if (leaderboard[i].player == _player) {
                existingPosition = int256(i);
                break;
            }
        }
        
        if (existingPosition != -1) {
            LeaderboardEntry storage existingEntry = leaderboard[uint256(existingPosition)];
            
            if (_finalScore > existingEntry.finalScore || 
                (_finalScore == existingEntry.finalScore && _correctCount > existingEntry.correctCount)) {
                
                for (uint256 i = uint256(existingPosition); i < DAILY_LEADERBOARD_SIZE - 1; i++) {
                    leaderboard[i] = leaderboard[i + 1];
                }
                leaderboard[DAILY_LEADERBOARD_SIZE - 1] = LeaderboardEntry({
                    player: address(0),
                    slipId: 0,
                    finalScore: 0,
                    correctCount: 0
                });
            } else {
                return;
            }
        }
        
        int256 position = -1;
        for (uint256 i = DAILY_LEADERBOARD_SIZE; i > 0; i--) {
            uint256 index = i - 1;
            LeaderboardEntry storage entry = leaderboard[index];
            
            if (entry.player == address(0)) {
                position = int256(index);
                continue;
            }
            
            if (_finalScore > entry.finalScore || (_finalScore == entry.finalScore && _correctCount > entry.correctCount)) {
                position = int256(index);
            } else {
                break;
            }
        }

        if (position != -1) {
            for (uint256 i = DAILY_LEADERBOARD_SIZE - 1; i > uint256(position); i--) {
                leaderboard[i] = leaderboard[i-1];
            }
            
            leaderboard[uint256(position)] = LeaderboardEntry({
                player: _player, 
                slipId: _slipId, 
                finalScore: _finalScore, 
                correctCount: _correctCount
            });
            
            cycleInfo[_cycleId].hasWinner = true;
        }
    }

    function _calculatePrize(uint8 _rank, uint256 _totalPrizePool) private pure returns (uint256) {
        uint256 percentage;
        if (_rank == 0) percentage = 4000;
        else if (_rank == 1) percentage = 3000;
        else if (_rank == 2) percentage = 2000;
        else if (_rank == 3) percentage = 500;
        else if (_rank == 4) percentage = 500;
        else return 0;

        return (_totalPrizePool * percentage) / 10000;
    }

    function _updateUserStats(address _user, uint256 _cycleId, bool _isPlacing) private {
        UserStats storage userStat = userStats[_user];
        
        if (_isPlacing) {
            userStat.totalSlips++;
            userStat.lastActiveCycle = _cycleId;
        } else {
            uint256[] storage userSlips = s_userSlipsPerCycle[_cycleId][_user];
            if (userSlips.length > 0) {
                uint256 latestSlipId = userSlips[userSlips.length - 1];
                Slip storage slip = slips[latestSlipId];
                
                uint256 reputationPoints = 0;
                
                if (slip.correctCount >= MIN_CORRECT_PREDICTIONS) {
                    userStat.totalWins++;
                    
                    userOddysseyCorrectPredictions[_user] += slip.correctCount;
                    
                    reputationPoints = 3;
                    
                    if (slip.correctCount >= 8) reputationPoints = 4;
                    if (slip.correctCount >= 9) reputationPoints = 6;
                    if (slip.correctCount == 10) reputationPoints = 8;
                    
                    bool isWinner = false;
                    for (uint8 i = 0; i < DAILY_LEADERBOARD_SIZE; i++) {
                        if (dailyLeaderboards[_cycleId][i].player == _user) {
                            isWinner = true;
                            break;
                        }
                    }
                    if (isWinner) reputationPoints += 10;
                    
                    
                    if (slip.finalScore > userStat.bestScore) {
                        userStat.bestScore = slip.finalScore;
                        reputationPoints += 2;
                    }
                    
                    if (_cycleId == userStat.lastActiveCycle + 1) {
                        userStat.currentStreak++;
                        if (userStat.currentStreak > userStat.bestStreak) {
                            userStat.bestStreak = userStat.currentStreak;
                            reputationPoints += 3;
                        }
                    } else {
                        userStat.currentStreak = 1;
                    }
                } else {
                    userStat.currentStreak = 0;
                    reputationPoints = 1;
                }
                
                userOddysseyReputation[_user] += reputationPoints;
                
                if (address(reputationSystem) != address(0)) {
                    IReputationSystem.ReputationAction action;
                    
                    if (slip.finalScore >= 9) {
                        action = IReputationSystem.ReputationAction.ODDYSSEY_PERFECT;
                    } else if (slip.finalScore >= 8) {
                        action = IReputationSystem.ReputationAction.ODDYSSEY_OUTSTANDING;
                    } else if (slip.finalScore >= 7) {
                        action = IReputationSystem.ReputationAction.ODDYSSEY_EXCELLENT;
                    } else if (slip.finalScore >= 5) {
                        action = IReputationSystem.ReputationAction.ODDYSSEY_QUALIFYING;
                    } else {
                        action = IReputationSystem.ReputationAction.ODDYSSEY_PARTICIPATION;
                    }
                    
                    reputationSystem.recordReputationAction(
                        _user,
                        action,
                        string(abi.encodePacked("Oddyssey cycle ", _cycleId, " - ", slip.correctCount, " correct"))
                    );
                }
                
                if (userStat.totalSlips > 0) {
                    userStat.averageScore = (userStat.averageScore * (userStat.totalSlips - 1) + slip.finalScore) / userStat.totalSlips;
                    userStat.winRate = (userStat.totalWins * 10000) / userStat.totalSlips;
                }
                
                emit OddysseyReputationUpdated(_user, reputationPoints, slip.correctCount, userOddysseyReputation[_user]);
            }
        }
        
        emit UserStatsUpdated(_user, userStat.totalSlips, userStat.totalWins, userStat.bestScore, userStat.winRate);
    }

    function _handlePrizeRollover(uint256 _previousCycleId) private {
        if (_previousCycleId == 0) return;

        LeaderboardEntry[DAILY_LEADERBOARD_SIZE] storage leaderboard = dailyLeaderboards[_previousCycleId];
        if (leaderboard[0].player == address(0) || leaderboard[0].correctCount < MIN_CORRECT_PREDICTIONS) {
            uint256 prizeToRoll = dailyPrizePools[_previousCycleId];
            if (prizeToRoll > 0) {
                uint256 fee = (prizeToRoll * PRIZE_ROLLOVER_FEE_PERCENTAGE) / 10000;
                uint256 amountToTransfer = prizeToRoll - fee;

                dailyPrizePools[_previousCycleId] = 0;
                dailyPrizePools[_previousCycleId + 1] += amountToTransfer;
                
                (bool success, ) = payable(devWallet).call{value: fee, gas: 2300}("");
                if (!success) revert TransferFailed();

                emit PrizeRollover(_previousCycleId, _previousCycleId + 1, amountToTransfer);
            }
        }
    }
    
    
    
    function getCurrentCycle() external view returns (uint256) {
        return dailyCycleId;
    }
    
    function isCycleInitialized(uint256 _cycleId) external view returns (bool) {
        if (_cycleId > dailyCycleId || _cycleId == 0) {
            return false;
        }
        
        return dailyMatches[_cycleId][0].id > 0;
    }
    
    function getCycleMatches(uint256 _cycleId) external view returns (Match[MATCH_COUNT] memory) {
        if (_cycleId > dailyCycleId || _cycleId == 0) revert DataNotFound();
        return dailyMatches[_cycleId];
    }
    

    
    function getDailyStats(uint256 _cycleId) external view returns (DailyStats memory) {
        return DailyStats({
            slipCount: dailySlipCount[_cycleId],
            userCount: dailyUserCount[_cycleId],
            volume: dailyVolume[_cycleId],
            correctPredictions: dailyCorrectPredictions[_cycleId],
            evaluatedSlips: dailyEvaluatedSlips[_cycleId],
            averageScore: dailyEvaluatedSlips[_cycleId] > 0 ? 
                (dailyCorrectPredictions[_cycleId] * ODDS_SCALING_FACTOR) / dailyEvaluatedSlips[_cycleId] : 0,
            maxScore: dailyMaxScore[_cycleId],
            minScore: dailyMinScore[_cycleId],
            winnersCount: dailyWinnersCount[_cycleId]
        });
    }
    
    
    
    
    
    function getAllUserSlips(address _user) external view returns (uint256[] memory) {
        return s_userSlips[_user];
    }



    function canClaimPrize(address _user, uint256 _cycleId, uint256 _slipId) external view returns (
        bool canClaim,
        uint8 rank
    ) {
        if (_cycleId == 0 || _cycleId > dailyCycleId) return (false, 0);
        if (cycleInfo[_cycleId].state != CycleState.Resolved) return (false, 0);
        if (block.timestamp < claimableStartTimes[_cycleId]) return (false, 0);
        
        if (_slipId >= slipCount) return (false, 0);
        Slip storage slip = slips[_slipId];
        if (slip.player != _user) return (false, 0);
        if (slip.cycleId != _cycleId) return (false, 0);
        if (!slip.isEvaluated) return (false, 0);
        
        LeaderboardEntry[DAILY_LEADERBOARD_SIZE] storage leaderboard = dailyLeaderboards[_cycleId];
        for (uint8 i = 0; i < DAILY_LEADERBOARD_SIZE; i++) {
            if (leaderboard[i].player == _user && leaderboard[i].slipId == _slipId) {
                if (prizeClaimed[_cycleId][i]) return (false, 0);
                return (true, i);
            }
        }
        
        return (false, 0);
    }
    

    
} 