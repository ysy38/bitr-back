// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BitredictStaking is Ownable, ReentrancyGuard {
    IERC20 public bitrToken;
    // STT is native coin, not ERC20

    uint256 private constant REWARD_PRECISION = 1e18;
    uint256 private constant SECONDS_PER_YEAR = 365 days;
    uint256 private constant BASIS_POINTS = 10000;

    struct Tier {
        uint256 baseAPY; // in basis points (1000 = 10%)
        uint256 minStake;
        uint256 revenueShareRate; // in basis points (1000 = 10%)
    }

    struct Stake {
        uint256 amount;
        uint256 startTime;
        uint8 tierId;
        uint8 durationOption; // 0 = 3d, 1 = 5d, 2 = 7d (testnet)
        uint256 claimedRewardBITR;
        uint256 rewardDebtBITR;
        uint256 rewardDebtSTT;
    }

    mapping(address => Stake[]) public userStakes;
    Tier[] public tiers;

    uint256[] public durationBonuses = [0, 200, 400]; // +0%, +2%, +4%
    uint256[] public durations = [3 days, 5 days, 7 days]; // Testnet periods

    uint256 public lastRevenueDistribution;
    uint256 public distributionInterval = 30 days;

    uint256 public revenuePoolBITR;
    uint256 public revenuePoolSTT;

    mapping(uint8 => uint256) public totalStakedInTier;
    mapping(uint8 => uint256) public accRewardPerShareBITR;
    mapping(uint8 => uint256) public accRewardPerShareSTT;

    mapping(address => uint256) public pendingRevenueBITR;
    mapping(address => uint256) public pendingRevenueSTT;

    // Integration with BitredictPool
    mapping(address => bool) public authorizedPools;
    
    // Total statistics
    uint256 public totalStaked;
    uint256 public totalRewardsPaid;
    uint256 public totalRevenuePaid;

    event Staked(address indexed user, uint256 amount, uint8 tier, uint8 duration);
    event Claimed(address indexed user, uint256 bitrAmount);
    event Unstaked(address indexed user, uint256 amount);
    event RevenueAdded(uint256 bitrAmount, uint256 sttAmount);
    event RevenueDistributed();
    event RevenueClaimed(address indexed user, uint256 bitrAmount, uint256 sttAmount);
    event PoolAuthorized(address indexed pool, bool authorized);

    constructor(address _bitr) Ownable(msg.sender) {
        require(_bitr != address(0), "Invalid BITR address");
        bitrToken = IERC20(_bitr);
        lastRevenueDistribution = block.timestamp;
        tiers.push(Tier({ baseAPY: 600, minStake: 1000 ether, revenueShareRate: 1000 })); // 6% APY, 10% revenue
        tiers.push(Tier({ baseAPY: 1200, minStake: 3000 ether, revenueShareRate: 3000 })); // 12% APY, 30% revenue
        tiers.push(Tier({ baseAPY: 1800, minStake: 10000 ether, revenueShareRate: 6000 })); // 18% APY, 60% revenue
    }

    modifier validStakeIndex(address _user, uint256 _index) {
        require(_index < userStakes[_user].length, "Invalid stake index");
        _;
    }

    modifier validTier(uint8 _tierId) {
        require(_tierId < tiers.length, "Invalid tier");
        _;
    }

    modifier validDuration(uint8 _durationOption) {
        require(_durationOption < durations.length, "Invalid duration");
        _;
    }

    function authorizePool(address _pool, bool _authorized) external onlyOwner {
        require(_pool != address(0), "Invalid pool address");
        authorizedPools[_pool] = _authorized;
        emit PoolAuthorized(_pool, _authorized);
    }

    // Accepts BITR as ERC20, STT as native coin
    function addRevenueFromPool(uint256 _bitrAmount) external payable {
        require(authorizedPools[msg.sender], "Unauthorized pool");
        _addRevenue(_bitrAmount, msg.value);
    }

    function addRevenue(uint256 _bitrAmount) external payable onlyOwner {
        _addRevenue(_bitrAmount, msg.value);
    }

    function _addRevenue(uint256 _bitrAmount, uint256 _sttAmount) internal {
        if (_bitrAmount > 0) {
            bitrToken.transferFrom(msg.sender, address(this), _bitrAmount);
            revenuePoolBITR += _bitrAmount;
        }
        if (_sttAmount > 0) {
            revenuePoolSTT += _sttAmount;
        }
        emit RevenueAdded(_bitrAmount, _sttAmount);
    }

    function fundAPYRewards(uint256 _amount) external onlyOwner {
        require(_amount > 0, "Amount must be greater than 0");
        bitrToken.transferFrom(msg.sender, address(this), _amount);
    }

    function distributeRevenue() public {
        require(block.timestamp >= lastRevenueDistribution + distributionInterval, "Distribution too early");
        lastRevenueDistribution = block.timestamp;

        uint256 totalBITR = revenuePoolBITR;
        uint256 totalSTT = revenuePoolSTT;

        if (totalBITR == 0 && totalSTT == 0) {
            return;
        }

        revenuePoolBITR = 0;
        revenuePoolSTT = 0;

        for (uint8 i = 0; i < tiers.length; i++) {
            uint256 totalStakedTier = totalStakedInTier[i];
            if (totalStakedTier == 0) {
                continue;
            }

            uint256 tierShare = tiers[i].revenueShareRate;
            uint256 tierRevenueBITR = (totalBITR * tierShare) / BASIS_POINTS;
            uint256 tierRevenueSTT = (totalSTT * tierShare) / BASIS_POINTS;

            if (tierRevenueBITR > 0) {
                accRewardPerShareBITR[i] += (tierRevenueBITR * REWARD_PRECISION) / totalStakedTier;
            }
            if (tierRevenueSTT > 0) {
                accRewardPerShareSTT[i] += (tierRevenueSTT * REWARD_PRECISION) / totalStakedTier;
            }
        }

        emit RevenueDistributed();
    }

    function _harvestRevenueRewards(address _user) internal {
        for (uint256 i = 0; i < userStakes[_user].length; i++) {
            Stake storage s = userStakes[_user][i];

            uint256 accBITR = accRewardPerShareBITR[s.tierId];
            uint256 accSTT = accRewardPerShareSTT[s.tierId];

            uint256 pendingBITR = (s.amount * accBITR) / REWARD_PRECISION - s.rewardDebtBITR;
            uint256 pendingSTT = (s.amount * accSTT) / REWARD_PRECISION - s.rewardDebtSTT;

            if (pendingBITR > 0) {
                pendingRevenueBITR[_user] += pendingBITR;
            }
            if (pendingSTT > 0) {
                pendingRevenueSTT[_user] += pendingSTT;
            }

            s.rewardDebtBITR = (s.amount * accBITR) / REWARD_PRECISION;
            s.rewardDebtSTT = (s.amount * accSTT) / REWARD_PRECISION;
        }
    }

    function claimRevenue() external nonReentrant {
        _harvestRevenueRewards(msg.sender);

        uint256 bitrAmount = pendingRevenueBITR[msg.sender];
        uint256 sttAmount = pendingRevenueSTT[msg.sender];

        require(bitrAmount > 0 || sttAmount > 0, "Nothing to claim");

        pendingRevenueBITR[msg.sender] = 0;
        pendingRevenueSTT[msg.sender] = 0;

        if (bitrAmount > 0) {
            require(bitrToken.balanceOf(address(this)) >= bitrAmount, "Insufficient BITR balance");
            bitrToken.transfer(msg.sender, bitrAmount);
            totalRevenuePaid += bitrAmount;
        }
        if (sttAmount > 0) {
            require(address(this).balance >= sttAmount, "Insufficient STT balance");
            (bool success, ) = payable(msg.sender).call{value: sttAmount}("");
            require(success, "STT transfer failed");
        }

        emit RevenueClaimed(msg.sender, bitrAmount, sttAmount);
    }

    function stake(uint256 _amount, uint8 _tierId, uint8 _durationOption) 
        external 
        nonReentrant 
        validTier(_tierId) 
        validDuration(_durationOption) 
    {
        require(_amount > 0, "Stake amount must be greater than 0");
        Tier memory tier = tiers[_tierId];
        require(_amount >= tier.minStake, "Below tier minimum stake");
        _harvestRevenueRewards(msg.sender);
        bitrToken.transferFrom(msg.sender, address(this), _amount);
        userStakes[msg.sender].push(
            Stake({
                amount: _amount,
                startTime: block.timestamp,
                tierId: _tierId,
                durationOption: _durationOption,
                claimedRewardBITR: 0,
                rewardDebtBITR: (_amount * accRewardPerShareBITR[_tierId]) / REWARD_PRECISION,
                rewardDebtSTT: (_amount * accRewardPerShareSTT[_tierId]) / REWARD_PRECISION
            })
        );
        totalStakedInTier[_tierId] += _amount;
        totalStaked += _amount;
        emit Staked(msg.sender, _amount, _tierId, _durationOption);
    }

    function calculateRewards(address _user, uint256 _index) 
        public 
        view 
        validStakeIndex(_user, _index) 
        returns (uint256 bitrReward) 
    {
        Stake memory s = userStakes[_user][_index];
        Tier memory t = tiers[s.tierId];
        uint256 bonus = durationBonuses[s.durationOption];
        uint256 totalAPY = t.baseAPY + bonus;
        uint256 timeStaked = block.timestamp - s.startTime;
        uint256 yearlyReward = (s.amount * totalAPY) / BASIS_POINTS;
        uint256 earned = (yearlyReward * timeStaked) / SECONDS_PER_YEAR;
        bitrReward = earned > s.claimedRewardBITR ? earned - s.claimedRewardBITR : 0;
    }

    function claim(uint256 _index) public nonReentrant validStakeIndex(msg.sender, _index) {
        _claim(msg.sender, _index);
    }

    function _claim(address _user, uint256 _index) internal {
        Stake storage s = userStakes[_user][_index];
        uint256 bitrAmount = calculateRewards(_user, _index);
        if (bitrAmount > 0) {
            s.claimedRewardBITR += bitrAmount;
            require(bitrToken.balanceOf(address(this)) >= bitrAmount, "Insufficient contract balance");
            bitrToken.transfer(_user, bitrAmount);
            totalRewardsPaid += bitrAmount;
        }
        emit Claimed(_user, bitrAmount);
    }

    function unstake(uint256 _index) external nonReentrant validStakeIndex(msg.sender, _index) {
        _harvestRevenueRewards(msg.sender);
        Stake memory s = userStakes[msg.sender][_index];
        require(block.timestamp >= s.startTime + durations[s.durationOption], "Stake is locked");
        _claim(msg.sender, _index); // auto-claim APY rewards
        uint256 unstakeAmount = s.amount;
        totalStakedInTier[s.tierId] -= unstakeAmount;
        totalStaked -= unstakeAmount;
        // Remove stake using swap-and-pop
        Stake[] storage stakes = userStakes[msg.sender];
        stakes[_index] = stakes[stakes.length - 1];
        stakes.pop();
        require(bitrToken.balanceOf(address(this)) >= unstakeAmount, "Insufficient contract balance");
        bitrToken.transfer(msg.sender, unstakeAmount);
        emit Unstaked(msg.sender, unstakeAmount);
    }

    // View functions for frontend integration
    function getUserStakes(address _user) external view returns (Stake[] memory) {
        return userStakes[_user];
    }

    function getTiers() external view returns (Tier[] memory) {
        return tiers;
    }

    function getDurationOptions() external view returns (uint256[] memory) {
        return durations;
    }

    function getRevenueShareRate(address _user, uint256 _index) 
        external 
        view 
        validStakeIndex(_user, _index) 
        returns (uint256) 
    {
        Stake memory s = userStakes[_user][_index];
        Tier memory t = tiers[s.tierId];
        return t.revenueShareRate;
    }

    function getPendingRewards(address _user, uint256 _index) 
        external 
        view 
        validStakeIndex(_user, _index) 
        returns (uint256 apyReward, uint256 pendingBITR, uint256 pendingSTT) 
    {
        apyReward = calculateRewards(_user, _index);
        Stake memory s = userStakes[_user][_index];
        uint256 accBITR = accRewardPerShareBITR[s.tierId];
        uint256 accSTT = accRewardPerShareSTT[s.tierId];
        pendingBITR = (s.amount * accBITR) / REWARD_PRECISION - s.rewardDebtBITR;
        pendingSTT = (s.amount * accSTT) / REWARD_PRECISION - s.rewardDebtSTT;
    }

    function getUserTotalStaked(address _user) external view returns (uint256 total) {
        Stake[] memory stakes = userStakes[_user];
        for (uint256 i = 0; i < stakes.length; i++) {
            total += stakes[i].amount;
        }
    }

    function getUserStakeCount(address _user) external view returns (uint256) {
        return userStakes[_user].length;
    }

    function getContractStats() external view returns (
        uint256 _totalStaked,
        uint256 _totalRewardsPaid,
        uint256 _totalRevenuePaid,
        uint256 _contractBITRBalance,
        uint256 _contractSTTBalance
    ) {
        _totalStaked = totalStaked;
        _totalRewardsPaid = totalRewardsPaid;
        _totalRevenuePaid = totalRevenuePaid;
        _contractBITRBalance = bitrToken.balanceOf(address(this));
        _contractSTTBalance = address(this).balance;
    }

    function getTierStats() external view returns (
        uint256[] memory tierStaked,
        uint256[] memory tierAPY,
        uint256[] memory tierMinStake,
        uint256[] memory tierRevenueShare
    ) {
        uint256 tierCount = tiers.length;
        tierStaked = new uint256[](tierCount);
        tierAPY = new uint256[](tierCount);
        tierMinStake = new uint256[](tierCount);
        tierRevenueShare = new uint256[](tierCount);
        for (uint256 i = 0; i < tierCount; i++) {
            tierStaked[i] = totalStakedInTier[uint8(i)];
            tierAPY[i] = tiers[i].baseAPY;
            tierMinStake[i] = tiers[i].minStake;
            tierRevenueShare[i] = tiers[i].revenueShareRate;
        }
    }

    function isStakeUnlocked(address _user, uint256 _index) 
        external 
        view 
        validStakeIndex(_user, _index) 
        returns (bool) 
    {
        Stake memory s = userStakes[_user][_index];
        return block.timestamp >= s.startTime + durations[s.durationOption];
    }

    function getTimeUntilUnlock(address _user, uint256 _index) 
        external 
        view 
        validStakeIndex(_user, _index) 
        returns (uint256) 
    {
        Stake memory s = userStakes[_user][_index];
        uint256 unlockTime = s.startTime + durations[s.durationOption];
        if (block.timestamp >= unlockTime) {
            return 0;
        }
        return unlockTime - block.timestamp;
    }
} 