# LEDGR - A FINANCIAL MANAGEMENT PLATFORM

## OVERVIEW
Ledgr is a comprehensive finance management platform for retail businesses in Africa.
It simplifies financial tracking, expense management, and cash flow analysis 
for small and medium retail enterprises. Built with real-world African payment 
systems in mind.

## Features
- **Expense Tracking** - Track all business expenses with categories and tags
- **M-Pesa Integration** - Accept payments directly via M-Pesa Daraja API
- **AI Chatbot** - Get financial insights powered by Google Gemini
- **Notifications** - SMS and email alerts via Africa's Talking and SMTP
- **PDF Reports** - Generate financial reports and invoices
- **Secure Authentication** - JWT-based user authentication with bcrypt
- **Docker Ready** - Containerized for easy deployment
- **Responsive UI** - EJS templated frontend

## Project Structure
Ledger/
├── src/
│   ├── app.js              # Express app entry point
│   ├── routes/             # API route handlers
│   ├── controllers/        # Business logic
│   ├── models/             # Database models
│   ├── middleware/         # Express middleware
│   ├── services/           # External integrations (M-Pesa, Gemini, etc.)
│   ├── utils/              # Helper functions & cron jobs
│   └── views/              # EJS templates
├── config/                 # Configuration files
├── migrations/             # Database migrations & seeds
├── uploads/                # User-uploaded files
├── .env.example            # Environment template
├── Dockerfile              # Docker configuration
├── docker-compose.yml      # Docker Compose setup
├── package.json            # Dependencies & scripts
└── README.md               #What the project contains and how it works

## Tech Stack
| Component | Technology |
|-----------|-----------|
| **Runtime** | Node.js |
| **Framework** | Express.js |
| **Templating** | EJS |
| **Database** | PostgreSQL |
| **Authentication** | JWT + bcryptjs |
| **Payment** | M-Pesa Daraja API |
| **AI** | Google Generative AI (Gemini) |
| **Notifications** | Africa's Talking, Nodemailer |
| **Reports** | PDFKit |
| **Containerization** | Docker |

## Getting Started 

### Prerequisites
- Node.js >= 18.0.0
- PostgreSQL running locally or remotely
- Git

### Installation {local setup}
1. **Clone the repository**
   ``bash
   git clone https://github.com/TamaraZawadi/Ledger.git
   cd Ledger
2. **Install dependencies**
    npm install
    

### Installation {Docker setup}
    - Enable virtualization from the Task Manager
    - Install WSL2 from Powershell 
    - Download and install Docker Desktop
    ```to build and start a fresh
        docker compose up --build
    ```to stop and remove
        docker compose down -v
    - Access at https://localhost:3000                    


### Environment Setup
    - copy env.example to .env 
    - edit .env with your configurations i.e. DB_PASSWORD, PORT etc


### Database Setup
    - npm run migrate
    - npm run seed


### Running the Application     
    - npm run dev
    - Application runs on https://localhost:3000

