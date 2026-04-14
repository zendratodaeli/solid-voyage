# Solid Voyage

**Maritime Freight Intelligence Platform** — a full-stack SaaS application for shipbrokers, chartering managers, and vessel operators to make data-driven voyage profitability decisions.

Built with **Next.js 16**, **Prisma**, **Neon (Serverless Postgres)**, and **Clerk Authentication**.

---

## Features

### Voyage Economics & Calculation Engine
- Complete **TCE** (Time Charter Equivalent), break-even freight, and P&L calculations
- Multi-fuel consumption modeling with split-zone sensitivity (SECA vs Open Sea)
- EU ETS carbon tax and **CII rating** impact analysis
- Sensitivity analysis across bunker prices, speed profiles, and delay scenarios
- AI-powered freight recommendations with confidence scoring

### Operations Map
- **AIS Fleet Tracking** — real-time vessel positions via AIS integration
- **Route Planner** — multi-leg maritime route planning with NavAPI (Seametrix) integration, strategic passage detection (Suez, Panama, Kiel, etc.), and draft-based canal exclusion
- **Weather Intelligence** — maritime weather forecasting with custom location support and coordinate parsing (DMS, Google Maps URLs)
- Weather-optimized routing via Python microservice (Isochrone/A* pathfinding)

### Fleet Operations
- **Pipeline Board** — drag-and-drop Kanban board for cargo inquiry lifecycle management (New → Offered → Fixed → Completed)
- **Fleet Timeline** — Gantt-style vessel scheduling and availability visualization
- Cargo inquiry management with AI-powered document parsing (email, PDF, clipboard)

### Vessel Management
- Comprehensive vessel profiles supporting bulk carriers, tankers, container ships, LNG/LPG carriers, and more
- Multi-fuel capability modeling (VLSFO, LSMGO, HFO, MGO, LNG)
- Speed/consumption profiles (Full Speed, Eco Speed) with per-voyage overrides
- AI-powered vessel particulars parsing from documents

### Compliance & Regulatory
- **SECA/ECA zone detection** — global Sulphur Emission Control Areas with automatic fuel-switching cost calculations
- **EU ETS taxation** — CO₂ emission tracking with 0% / 50% / 100% applicability rules
- **HRA (High Risk Area)** monitoring for piracy risk assessment
- **CII (Carbon Intensity Indicator)** rating projections (A–E)

### Platform
- Multi-tenant architecture with **Clerk Organizations**
- Role-based access control (Vessel Manager, Shipbroker, Operator, Owner)
- Real-time collaboration via **Pusher** WebSockets
- Organization branding, theming, and custom currency display
- PDF export for voyage reports
- Admin CMS for platform pages, port management, and system pricing
- Newsletter and email notifications via **Resend**
- Freemium usage tracking with rate limiting

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, React 19, Turbopack) |
| **Language** | TypeScript |
| **Database** | PostgreSQL via Neon (Serverless) |
| **ORM** | Prisma 7 with Neon driver adapter |
| **Auth** | Clerk (SSO, Organizations, Webhooks) |
| **Styling** | Tailwind CSS 4 + Radix UI + shadcn/ui |
| **Maps** | Leaflet + React Leaflet |
| **Charts** | Recharts |
| **AI** | OpenAI (Vercel AI SDK) |
| **Realtime** | Pusher (WebSockets) |
| **Caching** | Upstash Redis (Serverless) |
| **Email** | Resend |
| **Rich Text** | Tiptap |
| **Routing Engine** | NavAPI (Seametrix) for maritime distances |
| **Weather Routing** | Python / FastAPI microservice (Docker) |
| **Validation** | Zod 4 + React Hook Form |
| **PDF** | jsPDF + jspdf-autotable |
| **Geospatial** | Turf.js + searoute-js |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** (ships with Node)
- **PostgreSQL** — recommended via [Neon](https://neon.tech) (serverless)
- **Clerk** account — [clerk.com](https://clerk.com)
- **Python 3.12** (optional — only for the weather routing engine)
- **Docker** (optional — for containerized weather routing engine)

### 1. Clone the repository

```bash
git clone https://github.com/your-org/solid-vision.git
cd solid-vision
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in the required values in `.env`:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook signing secret |
| `NAVAPI_BEARER_TOKEN` | NavAPI (Seametrix) token for maritime routing |
| `OPENAI_API_KEY` | OpenAI API key for AI features |
| `RESEND_API_KEY` | Resend API key for emails |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL for caching |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token |

### 4. Set up the database

```bash
# Generate the Prisma client
npx prisma generate

# Push schema to the database
npm run db:push

# Seed initial data (ports, passages, pricing)
npm run db:seed
```

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

---

## Weather Routing Engine (Optional)

The project includes a Python-based weather routing microservice in the `engine/` directory that provides optimized maritime routes using oceanographic data.

### Running with Docker

```bash
cd engine
docker compose up --build
```

The service will be available at `http://localhost:8001`.

### Health Check

```
GET http://localhost:8001/health
```

---

## Project Structure

```
solid-vision/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── [orgSlug]/          # Multi-tenant org routes
│   │   │   ├── dashboard/      # Organization dashboard
│   │   │   ├── voyages/        # Voyage management & calculations
│   │   │   ├── vessels/        # Fleet vessel profiles
│   │   │   ├── operations-map/ # AIS, Route Planner, Weather
│   │   │   ├── fleet-operations/ # Pipeline & Timeline
│   │   │   ├── market-data/    # Freight & bunker market data
│   │   │   ├── laytime-calculator/ # Laytime calculations
│   │   │   └── settings/       # Organization settings
│   │   ├── api/                # API routes (30+ endpoints)
│   │   ├── admin/              # Super admin panel
│   │   └── sign-in/            # Auth pages (Clerk)
│   ├── actions/                # Server actions
│   ├── components/             # React components
│   │   ├── ui/                 # shadcn/ui primitives
│   │   ├── voyages/            # Voyage-specific components
│   │   ├── vessels/            # Vessel management UI
│   │   ├── operations-map/     # Map & routing components
│   │   ├── fleet-operations/   # Pipeline & timeline views
│   │   └── ...                 # Feature-specific components
│   ├── lib/                    # Shared utilities
│   │   ├── calculations/       # Voyage economics engine
│   │   ├── navapi-client.ts    # Maritime routing API client
│   │   ├── redis.ts            # Upstash Redis caching
│   │   └── prisma.ts           # Database client
│   ├── hooks/                  # Custom React hooks
│   ├── types/                  # TypeScript type definitions
│   └── data/                   # Static data (port lists, etc.)
├── prisma/
│   ├── schema.prisma           # Database schema (1300+ lines)
│   ├── migrations/             # Database migrations
│   └── seed.ts                 # Database seeder
├── engine/                     # Python weather routing microservice
│   ├── app/                    # FastAPI application
│   ├── Dockerfile              # Container build
│   └── docker-compose.yml      # Docker orchestration
├── public/                     # Static assets
└── scripts/                    # Utility scripts
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server (Turbopack) |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed database with initial data |
| `npm run db:studio` | Open Prisma Studio (database GUI) |

---

### Weather Routing Engine

Deploy the Python microservice separately using Docker on any container platform (Railway, Fly.io, AWS ECS, etc.).

---

## License

This project is proprietary software. All rights reserved.
