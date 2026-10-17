# 🎓 Exam Online

A modern, high-performance, Arabic-first (RTL) online examination platform built with **Next.js 16 (App Router)**, **PostgreSQL (Neon)**, **Prisma 7**, and **Tailwind CSS**.

Features AI-assisted question generation, Progressive Web App (PWA) installation, a mobile-first dark UI, and deep architectural optimizations for **free-tier hosting (Vercel & Neon Free Tier)** with zero database overload.

---

## 🌟 Key Features

### 1. 👨‍🏫 Teacher Dashboard
- **AI-Powered Question Import**:
  - Includes a pre-configured, tested prompt for (ChatGPT / Claude / Gemini) to transform raw textbook material and PDFs into validated JSON question banks.
  - **Zero-Latency (0ms) Client Validation**: Form settings and JSON schemas are validated locally in the browser with instant visual feedback and error notifications before hitting the server.
  - Interactive question review and approval workflow before publishing.
- **Granular Exam Controls**:
  - Adjustable countdown duration timer in minutes.
  - Question and option randomization (shuffling) per student to prevent cheating.
  - Maximum attempt restrictions (per student phone number or identifier).
  - Scheduled availability windows (`startsAt` and `endsAt`).
  - Result visibility policies: Immediate release upon completion (`IMMEDIATE`) or teacher-controlled manual release (`MANUAL`).
- **Submissions & Analytics**:
  - Live student progress monitoring.
  - Export submission results to UTF-8 BOM CSV / Excel compatible with Arabic characters.

### 2. 📱 Student Experience & PWA
- **Progressive Web App (PWA)**:
  - Fully installable on iOS, Android, and Desktop as a standalone application.
  - Custom Service Worker caching app shells, fonts, and static assets for lightning-fast loading.
  - Non-intrusive safety policies: API endpoints and exam submissions are strictly **Network-First** to prevent stale timers or cached responses.
- **Mobile-First & RTL Interface**:
  - Fluid, responsive interface using Cairo Arabic typography, designed and tested for small mobile viewports (e.g., iPhone SE / 390px).
- **Smart Autosave**:
  - Transparent background saving with payload deduplication; identical answer states skip network requests to minimize server bandwidth.
- **Deadline Enforcement**:
  - Synchronized server-validated countdown timer with automatic attempt finalization and submission when time expires.
- **Comprehensive Results & Mistakes Review**:
  - When enabled, students can review their scores alongside interactive filter tabs (`All Questions`, `Mistakes Only`, `Correct Answers`), complete with model answer explanations.

### 3. 🛡️ Free-Tier Serverless & Neon PostgreSQL Optimizations
- **Bounded LRU Rate Limiting ($O(1)$)**:
  - In-memory LRU rate limiter with a strict limit (`MAX_BUCKETS = 5,000`) preventing memory leaks on free single-instance containers.
  - **Carrier / School Wi-Fi Protection**: Dual-layer rate limiting separates shared network IPs (`60 req/min`) from individual student IDs (`6 req/min`), ensuring an entire classroom isn't blocked by one student's activity.
- **In-Memory Exam Question Cache**:
  - Caches exam questions and options in memory for 60 seconds, eliminating over **70% of repetitive database round-trips** during concurrent exam sessions.
  - Cache is invalidated immediately when exams are updated, imported, or deleted.
- **Neon Stale Socket & Cold-Start Resilience**:
  - Connection pool configuration (`max: 5`, `idleTimeoutMillis: 10,000`, `keepAlive: true`) combined with automatic single-retry queries on cold Neon instance wake-ups.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Server Actions, Metadata Routes) |
| **UI & Styling** | [React 19](https://react.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [Radix UI](https://www.radix-ui.com/), [Sonner](https://sonner.emilkowal.ski/) |
| **PWA** | Web App Manifest (`manifest.ts`), Custom Service Worker (`sw.js`), Apple Web App tags |
| **Database & ORM** | [PostgreSQL (Neon)](https://neon.tech/), [Prisma 7](https://www.prisma.io/) with `@prisma/adapter-pg` |
| **Language** | [TypeScript](https://www.typescriptlang.org/) |
| **Testing** | [Vitest](https://vitest.dev/) (Unit testing policy, grading engine, and auth suites) |
| **Security** | `scrypt` password hashing, tokenized student session access, input sanitization via [Zod](https://zod.dev/) |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** `>= 20.19`
- A free PostgreSQL database from [Neon](https://console.neon.tech) or a local PostgreSQL instance.

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/madany-ai/exam-online.git
   cd exam-online
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Fill in your connection credentials:
   ```env
   # Neon Pooled connection string (PgBouncer)
   DATABASE_URL="postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require"

   # Neon Direct connection string (for migrations)
   DATABASE_URL_UNPOOLED="postgresql://USER:PASSWORD@ep-xxx.REGION.aws.neon.tech/neondb?sslmode=require"

   # Base URL of the application
   APP_URL="http://localhost:3000"
   ```

4. **Deploy Database Schema**:
   ```bash
   npm run db:deploy
   ```

5. **Create Teacher Account**:
   Run the interactive CLI script to create your administrative login:
   ```bash
   npm run teacher:create
   ```
   *(Alternatively, run `npm run db:seed` to populate sample exams and teacher credentials).*

6. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Production Deployment (Vercel)

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "feat: complete exam platform"
   git branch -M main
   git remote add origin https://github.com/madany-ai/exam-online.git
   git push -u origin main
   ```

2. **Import into Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new) and select the `exam-online` repository.
   - Build and Output settings are pre-configured in `package.json` (`prisma generate && next build`).

3. **Set Environment Variables in Vercel**:
   Add the following under **Project Settings > Environment Variables**:

   | Key | Description | Example |
   | :--- | :--- | :--- |
   | `DATABASE_URL` | Neon Pooled URL (contains `-pooler`) | `postgresql://...@ep-xxx-pooler...` |
   | `DATABASE_URL_UNPOOLED` | Neon Direct URL (without `-pooler`) | `postgresql://...@ep-xxx...` |
   | `APP_URL` | Production domain name | `https://exam-online.vercel.app` |

4. **Click Deploy**. Vercel will build and deploy the production application.

---

## 📄 JSON Question Import Specification

Questions can be imported in bulk using a structured JSON document:

```json
{
  "title": "General Biology Quiz",
  "description": "Comprehensive review of cell biology and genetics",
  "defaultDurationMinutes": 30,
  "questions": [
    {
      "id": "q1",
      "type": "SINGLE_CHOICE",
      "text": "What is the primary power-generating organelle in eukaryotic cells?",
      "points": 2,
      "explanation": "Mitochondria produce the majority of the cell's ATP supply.",
      "options": [
        { "id": "opt1", "text": "Mitochondria", "isCorrect": true },
        { "id": "opt2", "text": "Ribosome", "isCorrect": false },
        { "id": "opt3", "text": "Endoplasmic Reticulum", "isCorrect": false },
        { "id": "opt4", "text": "Golgi Apparatus", "isCorrect": false }
      ]
    },
    {
      "id": "q2",
      "type": "TRUE_FALSE",
      "text": "DNA replication occurs during the S-phase of the cell cycle.",
      "points": 1,
      "explanation": "The S-phase (Synthesis Phase) is specifically dedicated to DNA replication.",
      "options": [
        { "id": "t", "text": "True", "isCorrect": true },
        { "id": "f", "text": "False", "isCorrect": false }
      ]
    }
  ]
}
```

### Supported Question Types:
- `SINGLE_CHOICE`: Single-select multiple choice question.
- `MULTIPLE_CHOICE`: Multi-select multiple choice question.
- `TRUE_FALSE`: Binary true or false question.

---

## 🧪 Testing & Verification

```bash
# Type check TypeScript files
npm run typecheck

# Lint source code
npm run lint

# Run all unit tests
npm run test
```

---

## 🔒 Security Design

- **Client Zero-Trust**: Correct answers (`isCorrect`) and explanation notes are never sent over the network to student browsers during active exams. All grading calculations execute server-side in a single atomic transaction.
- **Cryptographic Student Tokens**: Student attempts are secured using cryptographically strong 256-bit access tokens stored as SHA-256 hashes.
- **Password Protection**: Teacher passwords are hashed using Node.js's native `scrypt` implementation with unique random salts.
