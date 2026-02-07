# SmartRenovate

**Blockchain-Based Construction Escrow Platform**

A trustless, transparent payment system for construction and renovation projects built on Arc Testnet with cross-chain payment capabilities powered by Circle Bridge Kit.

---

## 🏗️ Overview

SmartRenovate revolutionizes the construction industry by providing a decentralized escrow platform that manages milestone-based payments, change orders, and dispute resolution through smart contracts. The platform ensures fair payments to contractors while protecting homeowners through verified milestone completion and professional inspections.

### Key Problem Solved

Traditional construction contracts suffer from trust issues, payment disputes, and lack of transparency. SmartRenovate eliminates these problems by:
- Locking funds in blockchain-based escrow
- Requiring third-party verification for milestone completion
- Providing transparent dispute resolution through arbitration
- Automating payments based on verified work completion

### Target Users

- **Prime Contractors**: Manage construction projects and receive payments upon milestone completion
- **Homeowners**: Fund projects securely and approve major milestones
- **Inspectors**: Verify work quality and approve milestone payments (10% inspector fee)
- **Arbitrators**: Resolve disputes fairly between contractors and homeowners

---

## ✨ Features

### Multi-Role Authentication System
- Four distinct roles with specific permissions and responsibilities
- Role-based dashboard with tailored functionality
- Wallet-based authentication using Web3 standards

### Milestone-Based Payment Escrow
- Projects divided into verifiable milestones
- Funds locked in smart contract until milestone approval
- Automatic payment release upon inspector verification
- Down payment and retention amount management
- Contingency fund for approved change orders

### Cross-Chain Payment Integration
- **90% to Contractor** on Arc Testnet (native USDC)
- **10% to Inspector** on Base Sepolia via Circle Bridge
- Automatic cross-chain transfers using Circle's Bridge Kit
- Dual-wallet architecture for operating and payment addresses

### Change Order Management
- Request additional funds from contingency reserve
- Homeowner approval required for change orders
- Transparent tracking of all change requests
- Automatic milestone amount adjustment

### Dispute Resolution & Arbitration
- Either party can open a dispute at any time
- Project freezes until resolution
- Arbitrator reviews evidence from both parties
- Proposed payment split requires mutual approval
- Documented resolution process

### Smart Contract Security
- Solidity 0.8.28 with built-in overflow protection
- Multi-signature approval patterns
- Role-based access control
- Comprehensive event logging for transparency

---

## 🛠️ Technology Stack

### Frontend
- **Next.js 16.1.6** - React framework with App Router
- **React 19.2.3** - Latest React with concurrent features
- **TypeScript 5** - Type-safe development
- **Tailwind CSS 4** - Utility-first styling
- **TanStack React Query 5.90.20** - Data fetching and caching

### Blockchain Integration
- **viem 2.45.1** - TypeScript Ethereum library
- **wagmi 3.4.2** - React hooks for Ethereum
- **Solidity 0.8.28** - Smart contract language
- **Hardhat 2.28.4** - Development environment
- **ethers.js 6.16.0** - Ethereum library

### Cross-Chain Infrastructure
- **Circle Bridge Kit 1.5.0** - Cross-chain transfer UI
- **Circle Adapter Viem 1.4.0** - Viem integration
- **Circle Developer Controlled Wallets 10.1.0** - Wallet management

### Network
- **Arc Testnet** (Chain ID: 5042002)
- **Base Sepolia** (for inspector payments)

---

## 📁 Project Structure

```
├── app/                          # Next.js App Router pages
│   ├── create-project/          # Project creation interface
│   ├── dashboard/               # Role-based dashboard
│   ├── project/[id]/            # Individual project views
│   │   ├── change-order/        # Change order requests
│   │   ├── inspect-milestone/   # Inspector verification
│   │   ├── milestone-details/   # Detailed milestone view
│   │   ├── open-dispute/        # Dispute filing
│   │   ├── propose-resolution/  # Arbitrator resolution
│   │   └── submit-milestone/    # Contractor submission
│   ├── arbitrator/              # Arbitrator dashboard
│   └── context/                 # React context providers
├── contracts/                    # Solidity smart contracts
│   └── RenovationEscrow.sol     # Main escrow contract
├── lib/                         # Utility libraries
│   ├── contract.ts              # Contract ABI and clients
│   └── bridge.ts                # Circle Bridge integration
├── scripts/                     # Deployment scripts
│   └── deploy.js                # Contract deployment
└── hardhat.config.ts            # Hardhat configuration
```

---

## 📜 Smart Contract

### Contract Details

- **Location**: `/contracts/RenovationEscrow.sol`
- **Network**: Arc Testnet
- **Chain ID**: 5042002
- **RPC URL**: https://arc-testnet.drpc.org
- **Native Currency**: USDC (18 decimals)
- **Deployed Address**: Set via `NEXT_PUBLIC_CONTRACT_ADDRESS`

### Key Contract Features

1. **Project Management**
   - Create projects with multiple milestones
   - Define down payment and retention percentages
   - Set contingency fund for unexpected costs
   - Assign inspector and arbitrator addresses

2. **Escrow & Payments**
   - Homeowner deposits full project amount
   - Automatic payment calculation (90% contractor, 10% inspector)
   - Down payment released upon project start
   - Milestone payments released upon approval
   - Retention held until final milestone

3. **Milestone Workflow**
   - Contractor submits proof of completion
   - Inspector verifies and approves/rejects
   - Auto-payment upon approval with cross-chain transfer
   - Rejection allows resubmission with fixes

4. **Change Order System**
   - Request additional funds from contingency
   - Homeowner approval required
   - Transparent tracking and documentation

5. **Dispute Handling**
   - Project can be frozen during disputes
   - Arbitrator proposes payment split
   - Requires approval from both parties
   - Resolution executed through milestone resubmission

### Payment Distribution

- **90%** to Prime Contractor (Arc Testnet USDC)
- **10%** to Inspector (Base Sepolia via Circle Bridge)

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- MetaMask or compatible Web3 wallet
- Arc Testnet USDC (get from faucet)
- Circle API credentials (for bridge functionality)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/SmartRenovate.git
   cd SmartRenovate
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your values:
   ```env
   # Deployment
   PRIVATE_KEY=your_deployment_private_key

   # Arc Testnet
   ARC_TESTNET_RPC_URL=https://arc-testnet.drpc.org
   NEXT_PUBLIC_ARC_CHAIN_ID=5042002
   NEXT_PUBLIC_ARC_RPC_URL=https://arc-testnet.drpc.org

   # Circle Integration
   CIRCLE_API_KEY=your_circle_api_key
   CIRCLE_ENTITY_SECRET=your_circle_entity_secret
   BRIDGE_KIT_ENV=testnet
   BRIDGE_WALLET_PRIVATE_KEY=your_bridge_wallet_key

   # Contract Address (after deployment)
   NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
   ```

4. **Deploy Smart Contract**
   ```bash
   npx hardhat run scripts/deploy.js --network arc-testnet
   ```

   Copy the deployed contract address to `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env.local`

5. **Run Development Server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

---

## 📝 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PRIVATE_KEY` | Private key for deploying contracts | Yes |
| `ARC_TESTNET_RPC_URL` | Arc Testnet RPC endpoint | Yes |
| `NEXT_PUBLIC_ARC_CHAIN_ID` | Arc Testnet chain ID (5042002) | Yes |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Deployed escrow contract address | Yes |
| `CIRCLE_API_KEY` | Circle API key for wallet services | Yes |
| `CIRCLE_ENTITY_SECRET` | Circle entity secret | Yes |
| `BRIDGE_WALLET_PRIVATE_KEY` | Wallet for cross-chain transfers | Yes |
| `BRIDGE_KIT_ENV` | Bridge environment (testnet/mainnet) | Yes |
| `NEXT_PUBLIC_ARC_RPC_URL` | Public RPC URL for frontend | Optional |

### Obtaining Circle API Credentials

1. Visit [Circle Developer Console](https://console.circle.com/)
2. Create a new account or sign in
3. Navigate to API Keys section
4. Generate new API key and entity secret
5. Add credentials to your `.env.local` file

---

## 📖 Usage Guide

### As a Contractor

1. **Connect Wallet** with Contractor role
2. **Create Project** with milestone breakdown
   - Define project details and total amount
   - Set down payment percentage (typically 10-20%)
   - Set retention percentage (typically 5-10%)
   - Define milestone percentages and descriptions
   - Assign homeowner, inspector, and arbitrator addresses
3. **Wait for Homeowner Approval**
4. **After Deposit**: Receive down payment
5. **Submit Milestones** with proof of completion
6. **Receive Payment** upon inspector approval
7. **Request Change Orders** if additional work needed

### As a Homeowner

1. **Connect Wallet** with Homeowner role
2. **Review Project Proposal** from contractor
3. **Approve Project** if terms are acceptable
4. **Deposit Funds** to escrow (full project amount)
5. **Authorize Project Start** (triggers down payment)
6. **Review Change Orders** and approve/reject
7. **Monitor Progress** through dashboard
8. **Open Dispute** if issues arise

### As an Inspector

1. **Connect Wallet** with Inspector role
2. **Review Submitted Milestones**
3. **Verify Work Completion**
   - Check proof documents
   - Visit site if necessary
   - Verify quality standards
4. **Approve or Reject** milestone
   - Approve: Triggers automatic payment (90% contractor, 10% inspector)
   - Reject: Contractor must fix and resubmit
5. **Receive 10% Fee** automatically via Circle Bridge to Base Sepolia

### As an Arbitrator

1. **Connect Wallet** with Arbitrator role
2. **View Active Disputes** on dashboard
3. **Review Evidence** from both parties
4. **Propose Resolution** with payment split percentage
5. **Wait for Mutual Approval** from contractor and homeowner
6. **Guide Execution** after both parties approve

---

## 🏛️ Architecture

### High-Level Flow

```
1. Contractor creates project → 2. Homeowner approves
                                ↓
3. Homeowner deposits funds → 4. Smart contract locks funds
                                ↓
5. Homeowner starts project → 6. Down payment released
                                ↓
7. Contractor submits milestone → 8. Inspector verifies
                                    ↓
9. Inspector approves → 10. Payment executed (90% + 10%)
                           ↓
11. Circle Bridge transfers 10% to Base Sepolia
```

### Payment Flow

```
Homeowner Deposit (100%) → Smart Contract Escrow
                              ↓
        ┌─────────────────────┴──────────────────────┐
        ↓                                             ↓
Down Payment (10-20%)                      Milestone Payments
Released on Start                          Released on Approval
        ↓                                             ↓
Contractor Wallet (Arc)               ┌───────────────┴────────────┐
                                      ↓                             ↓
                              90% Contractor (Arc)      10% Inspector
                                                        (Base Sepolia via Bridge)
```

### Dispute Resolution Flow

```
1. Either party opens dispute → 2. Project frozen
                                  ↓
3. Arbitrator reviews evidence → 4. Proposes payment split
                                  ↓
5. Both parties approve → 6. Contractor resubmits milestone
                            ↓
7. Inspector approves → 8. Payment executed per resolution
```

---

## 🔧 Development

### Run Locally

```bash
npm run dev
```

### Compile Contracts

```bash
npx hardhat compile
```

### Run Tests

```bash
npx hardhat test
```

### Deploy to Arc Testnet

```bash
npx hardhat run scripts/deploy.js --network arc-testnet
```

### Verify Contract

```bash
npx hardhat verify --network arc-testnet DEPLOYED_CONTRACT_ADDRESS
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Use TypeScript for type safety
- Follow existing code formatting
- Add comments for complex logic
- Update documentation as needed

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 🙏 Acknowledgments

- Built for **HackMoney 2026**
- Powered by **Circle Bridge Kit** for cross-chain transfers
- Deployed on **Arc Testnet** by Decent
- Inspired by the need for transparent construction contracts

---

## 📞 Support

For questions or issues:
- Open an issue on GitHub
- Check existing documentation
- Review smart contract comments

---

## 🔒 Security

- Never commit private keys or sensitive data
- Always use `.env.local` for local development
- Rotate keys if accidentally exposed
- Audit smart contracts before mainnet deployment

---

**Built with ❤️ for transparent construction payments**
