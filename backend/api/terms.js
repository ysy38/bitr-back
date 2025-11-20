const express = require('express');
const router = express.Router();

// Terms and Conditions Data
const TERMS_DATA = {
  version: "1.0",
  lastUpdated: "2025-08-15",
  effectiveDate: "2025-08-15",
  title: "Bitredict Terms of Service and Privacy Policy",
  sections: [
    {
      id: "acceptance",
      title: "1. Acceptance of Terms",
      content: `By accessing and using Bitredict ("the Platform"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.

The Platform is a decentralized prediction gaming platform built on Somnia blockchain technology. By using our services, you acknowledge that you understand the risks associated with blockchain technology and cryptocurrency transactions.`
    },
    {
      id: "eligibility",
      title: "2. Eligibility and User Requirements",
      content: `To use Bitredict, you must:
• Be at least 18 years of age or the legal age of majority in your jurisdiction
• Have the legal capacity to enter into binding agreements
• Not be located in a jurisdiction where prediction gaming or cryptocurrency use is prohibited
• Comply with all applicable local, state, national, and international laws and regulations
• Maintain the security of your cryptocurrency wallet and private keys

For BITR token faucet eligibility, you must additionally:
• Complete at least 2 Oddyssey game predictions
• Maintain an active gaming profile with STT and BITR token activity
• Accept these terms and authenticate your wallet connection`
    },
    {
      id: "platform_description",
      title: "3. Platform Description",
      content: `Bitredict offers the following services:
• **Oddyssey Game**: A daily prediction game where users predict sports match outcomes
• **Prediction Pools**: Create and participate in custom prediction markets
• **BITR Token Faucet**: Earn testnet BITR tokens for active participation
• **Reputation System**: Track your prediction accuracy and gaming achievements
• **Leaderboards**: Compete with other players for prizes and recognition

All games use Somnia Testnet tokens (STT) and BITR tokens for participation and rewards.`
    },
    {
      id: "user_responsibilities",
      title: "4. User Responsibilities",
      content: `As a user of Bitredict, you agree to:
• Provide accurate and truthful information
• Maintain the confidentiality of your account credentials
• Use the platform only for lawful purposes
• Not attempt to manipulate, exploit, or abuse the platform's systems
• Not engage in any form of cheating, collusion, or fraudulent activity
• Respect other users and maintain appropriate conduct
• Report any bugs, vulnerabilities, or suspicious activities to our team

You are solely responsible for:
• The security of your cryptocurrency wallet and private keys
• All transactions made from your wallet address
• Compliance with applicable laws in your jurisdiction
• Any losses resulting from your use of the platform`
    },
    {
      id: "blockchain_risks",
      title: "5. Blockchain and Cryptocurrency Risks",
      content: `You acknowledge and accept the following risks:

**Testnet Environment**: Bitredict operates on Somnia Testnet. All tokens have no real-world value and are for testing purposes only.

**Smart Contract Risks**: Our platform uses smart contracts which may contain bugs or vulnerabilities. We make no guarantees about the security or functionality of smart contracts.

**Network Risks**: Blockchain networks may experience congestion, forks, or other technical issues that could affect your ability to use the platform.

**Wallet Security**: You are responsible for securing your wallet. Lost private keys cannot be recovered.

**Regulatory Changes**: Cryptocurrency regulations may change and affect the platform's availability in your jurisdiction.`
    },
    {
      id: "gaming_rules",
      title: "6. Gaming Rules and Fair Play",
      content: `**Oddyssey Game Rules**:
• Predictions must be submitted before match start times
• Each user may submit one prediction slip per daily cycle
• Scoring is based on correct predictions multiplied by odds
• Prizes are distributed to top performers according to published rules
• Minimum 2 correct predictions required for prize eligibility

**General Gaming Conduct**:
• No automated betting or use of bots
• No sharing of accounts or coordinated betting
• No exploitation of system vulnerabilities
• Disputes will be resolved based on blockchain transaction records
• Our decisions on rule violations are final`
    },
    {
      id: "faucet_terms",
      title: "7. BITR Token Faucet Terms",
      content: `The BITR token faucet is subject to the following conditions:
• Limited to one claim per wallet address
• Requires completion of at least 2 Oddyssey predictions
• Requires active STT token gaming activity
• Faucet may be suspended or modified at any time
• BITR tokens are testnet tokens with no monetary value
• Faucet funds are limited and distributed on a first-come, first-served basis
• We reserve the right to modify eligibility requirements`
    },
    {
      id: "privacy_policy",
      title: "8. Privacy Policy",
      content: `**Data Collection**: We collect minimal data necessary for platform operation:
• Wallet addresses for transaction processing
• Game statistics and prediction history
• Technical data for platform improvement

**Data Usage**: Your data is used to:
• Process transactions and maintain game state
• Calculate rankings and distribute rewards
• Improve platform functionality and user experience
• Comply with legal requirements

**Data Protection**: We implement reasonable security measures to protect your data. However, no system is completely secure.

**Third-Party Services**: We may use third-party services (analytics, infrastructure) that have their own privacy policies.

**Data Retention**: We retain data as long as necessary for platform operation and legal compliance.`
    },
    {
      id: "intellectual_property",
      title: "9. Intellectual Property",
      content: `All content, trademarks, and intellectual property on Bitredict are owned by us or our licensors. You may not:
• Copy, modify, or distribute our content without permission
• Use our trademarks or branding without authorization
• Reverse engineer or attempt to extract source code
• Create derivative works based on our platform

You retain ownership of content you create (usernames, profiles) but grant us a license to use it for platform operation.`
    },
    {
      id: "disclaimers",
      title: "10. Disclaimers and Limitations",
      content: `**Platform Availability**: We strive for 99.9% uptime but cannot guarantee uninterrupted service. The platform may be unavailable due to maintenance, technical issues, or force majeure events.

**No Financial Advice**: Nothing on our platform constitutes financial, investment, or legal advice. All predictions and gaming are for entertainment purposes.

**Third-Party Content**: We are not responsible for the accuracy of sports data, odds, or other third-party information.

**Limitation of Liability**: To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the platform.

**Maximum Liability**: Our total liability to you shall not exceed the value of tokens you have deposited on the platform in the 30 days preceding the claim.`
    },
    {
      id: "termination",
      title: "11. Account Termination",
      content: `We may suspend or terminate your access to the platform if you:
• Violate these terms of service
• Engage in fraudulent or abusive behavior
• Pose a security risk to the platform or other users
• Fail to comply with applicable laws

Upon termination:
• Your access to the platform will be revoked
• Pending transactions may be cancelled
• You remain liable for any outstanding obligations
• These terms continue to apply to past use of the platform`
    },
    {
      id: "modifications",
      title: "12. Modifications to Terms",
      content: `We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting to the platform. Continued use of the platform after changes constitutes acceptance of the new terms.

We will make reasonable efforts to notify users of material changes through:
• Platform notifications
• Email notifications (if provided)
• Prominent display on the website

If you do not agree to modified terms, you must stop using the platform.`
    },
    {
      id: "governing_law",
      title: "13. Governing Law and Dispute Resolution",
      content: `These terms are governed by the laws of [Jurisdiction]. Any disputes arising from these terms or your use of the platform shall be resolved through:

1. **Informal Resolution**: First, contact us to attempt to resolve the dispute informally
2. **Arbitration**: If informal resolution fails, disputes shall be resolved through binding arbitration
3. **Class Action Waiver**: You waive the right to participate in class action lawsuits

**Jurisdiction**: You consent to the exclusive jurisdiction of courts in [Jurisdiction] for any legal proceedings.`
    },
    {
      id: "contact",
      title: "14. Contact Information",
      content: `For questions about these terms or the platform, contact us at:

**Email**: legal@bitredict.io
**Support**: support@bitredict.io
**Website**: https://bitredict.io


We will respond to inquiries within 48 hours during business days.`
    }
  ],
  summary: {
    title: "Terms Summary",
    points: [
      "You must be 18+ and legally eligible to use prediction gaming platforms",
      "Bitredict operates on Somnia Testnet - all tokens are for testing only",
      "BITR faucet requires 2+ Oddyssey predictions and STT and BITR activity",
      "You are responsible for wallet security and transaction safety",
      "No automated betting, cheating, or system exploitation allowed",
      "We may modify terms at any time with notice to users",
      "Platform availability and performance are not guaranteed",
      "Your data is protected but you use the platform at your own risk"
    ]
  }
};

/**
 * GET /terms/current
 * Get current terms and conditions
 */
router.get('/current', (req, res) => {
  try {
    res.json({
      success: true,
      terms: TERMS_DATA
    });
  } catch (error) {
    console.error('Error fetching terms:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch terms'
    });
  }
});

/**
 * GET /terms/summary
 * Get terms summary for quick display
 */
router.get('/summary', (req, res) => {
  try {
    res.json({
      success: true,
      version: TERMS_DATA.version,
      lastUpdated: TERMS_DATA.lastUpdated,
      title: TERMS_DATA.title,
      summary: TERMS_DATA.summary
    });
  } catch (error) {
    console.error('Error fetching terms summary:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch terms summary'
    });
  }
});

/**
 * GET /terms/version/:version
 * Get specific version of terms (for historical reference)
 */
router.get('/version/:version', (req, res) => {
  try {
    const { version } = req.params;
    
    // For now, we only have version 1.0
    if (version === '1.0') {
      res.json({
        success: true,
        terms: TERMS_DATA
      });
    } else {
      res.status(404).json({
        error: 'Version not found',
        message: `Terms version ${version} not found`
      });
    }
  } catch (error) {
    console.error('Error fetching terms version:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch terms version'
    });
  }
});

/**
 * POST /terms/accept
 * Record terms acceptance (redirects to faucet API)
 */
router.post('/accept', (req, res) => {
  // Redirect to faucet API for consistency
  res.json({
    success: true,
    message: 'Use /faucet/accept-terms endpoint to record acceptance',
    redirect: '/faucet/accept-terms'
  });
});

module.exports = router;
