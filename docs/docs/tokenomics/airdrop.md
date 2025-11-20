---
sidebar_position: 2
---

# BITR Token Testnet-to-Mainnet Airdrop

## 🎁 **Overview**

Bitredict will allocate **5% of the total mainnet BITR token supply** (i.e., **5,000,000 BITR**) as airdrop rewards to early testnet participants who actively used the platform on **Somnia testnet**.

The process is designed to ensure:

* **Fair distribution based on real usage**
* **Sybil resistance**
* **Long-term alignment with platform utility**

---

## 📘 **Phases of the Airdrop**

### 1. 🛠️ **Faucet Phase (Testnet BITR Distribution)**

* A faucet will be deployed to distribute **20,000 testnet BITR tokens** to each eligible wallet.
* **Each wallet can claim only once.**
* To claim from the faucet, the wallet must:

  * Interact with the platform at least once using **STT**:

    * Create a pool OR
    * Place a bet

---

### 2. 🧪 **Participation Requirements**

To be eligible for the mainnet airdrop, wallets **must meet all** of the following conditions **after claiming the faucet**:

| Requirement                                  | Description                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| 📉 BITR Usage                                | At least **20 actions** using BITR: betting or market creation                      |
| 🔒 BITR Staking                              | Stake some BITR during testnet                                                      |
| 🎮 Oddyssey Game Participation               | Submit at least **3 slips** in the Oddyssey daily game                              |
| 🔁 No suspicious transfers or wallet merging | Wallets that only received BITR via transfers without activity will be **excluded** |

---

### 3. 📸 **Snapshot Phase**

* A snapshot will be taken at a defined block/time to record the **BITR balance** of each eligible wallet.
* Only wallets that fulfilled the above criteria will be included.

---

## 🧮 **Airdrop Calculation Formula**

Mainnet BITR airdrop amounts will be calculated **proportionally** based on testnet BITR balances at the snapshot time:

```
airdroppedBITR = (wallet's BITR balance / total eligible BITR) × 5,000,000
```

> 📌 **Example:**
> If a wallet holds 10,000 BITR, and the total across all eligible wallets is 100,000:
> `(10,000 / 100,000) * 5,000,000 = 500,000 mainnet BITR`

---

## 🚫 **Sybil Defense Measures**

To protect the integrity of the airdrop:

* **Wallets that consolidate BITR from multiple addresses** will be automatically flagged and excluded.
* Any address that did **not perform any platform actions** but **received BITR only through transfers** will be excluded.
* Advanced filters like faucet claim history, transaction patterns, and timestamps will be used to detect abuse.

---

## 🧱 **Summary**

| Phase           | Details                                           |
| --------------- | ------------------------------------------------- |
| 💧 Faucet       | 20,000 testnet BITR per wallet (once)             |
| ✅ Eligibility   | STT activity + 20 BITR txs + stake + Oddyssey     |
| 📸 Snapshot     | BITR balances recorded for eligible wallets       |
| ⚖️ Distribution | Proportional based on snapshot holdings           |
| 🔒 Anti-Sybil   | Merging, multi-claiming, or no activity = EXCLUDE |

---

## 🧰 **Developer Notes**

* BITR faucet and eligibility will be tracked off-chain and on-chain via smart contracts and event logs.
* Final airdrop values will be computed via backend script:

  * Fetch snapshot balances
  * Filter eligible wallets
  * Normalize and scale to 5,000,000 BITR
* Airdrop claim on mainnet will be managed via a Merkle tree or similar verification system.

---

## 🎯 **How to Maximize Your Airdrop**

### **Step 1: Initial Activity**
1. **Use STT first** - Create a pool or place a bet
2. **Claim faucet** - Get your 20,000 testnet BITR (one-time only)

### **Step 2: Build Activity History**
1. **Use BITR actively** - Make 20+ actions (betting/pool creation)
2. **Stake your BITR** - Test the staking system across different tiers
3. **Play Oddyssey** - Submit at least 3 game slips
4. **Keep tokens in wallet** - Don't transfer to other wallets

### **Step 3: Hold Until Snapshot**
- **Maintain BITR balance** in your active wallet
- **Continue platform participation** to stay eligible
- **Avoid suspicious activity** that could trigger anti-sybil measures

### **Pro Tips**
- **Higher balance = Higher airdrop**: Your proportion of total eligible BITR determines your share
- **Stay active consistently**: Regular usage shows genuine participation
- **Test all features**: Use staking, Oddyssey, and prediction pools
- **One wallet only**: Don't try to game the system with multiple wallets

---

## ⚠️ **Important Notes**

### **Eligibility Requirements Are Cumulative**
All four requirements must be met. Missing any one requirement disqualifies the wallet entirely.

### **Snapshot Timing**
The exact snapshot time will be announced in advance. Make sure your BITR is in an eligible wallet at that time.

### **Anti-Sybil Is Strict**
Any attempt to game the system with multiple wallets, transfers between controlled addresses, or other manipulation will result in exclusion.

### **Mainnet Claim Process**
Details for claiming your mainnet airdrop will be provided closer to mainnet launch.

---

*The airdrop rewards genuine testnet participation and platform usage, ensuring that tokens go to users who will contribute to the mainnet ecosystem.* 