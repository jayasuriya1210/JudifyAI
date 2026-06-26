# 🏛️ JudifyAI - CaseLaw Audio Intelligence Platform

A modern, full-stack application that leverages AI to transform legal case documents into interactive, searchable, and accessible audio content. JudifyAI helps legal professionals, students, and researchers efficiently process, understand, and retain complex case law information.

## ✨ Features

- **📄 PDF Processing** - Upload and parse legal case documents
- **🎤 Text-to-Speech** - Convert case content to high-quality audio using multiple TTS engines (Piper, Edge TTS)
- **🔍 Intelligent Search** - Search through cases and extract relevant information
- **📝 Automatic Summarization** - Generate concise summaries of legal cases
- **📊 Web Scraping** - Extract case information from legal websites
- **💾 Case History** - Track and manage previously accessed cases
- **📓 Notes & Annotations** - Create and organize notes on cases
- **🌐 Web-Based Interface** - Modern, responsive UI for easy access
- **🔐 User Authentication** - Secure login and registration with JWT
- **📱 Responsive Design** - Works seamlessly on desktop and mobile devices

## 🏗️ Architecture

### Project Structure

```
JudifyAI/
├── frontend/                 # React + TypeScript + Vite
│   ├── src/
│   │   ├── pages/          # Page components
│   │   ├── components/     # Reusable UI components
│   │   ├── services/       # API integration
│   │   └── App.tsx         # Main app component
│   └── package.json
├── backend/                 # Node.js + Express
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── config/         # Database config
│   │   └── middleware/     # Express middleware
│   ├── server.js           # Express server entry point
│   └── package.json
├── package.json            # Monorepo workspace configuration
└── README.md
```

## 🛠️ Tech Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Shadcn/UI** - Component library
- **React Router** - Navigation
- **React Hook Form** - Form handling
- **Zod** - Schema validation
- **Tanstack Query** - Data fetching

### Backend
- **Node.js** - Runtime
- **Express 5** - Web framework
- **SQLite3** - Database
- **JWT** - Authentication
- **Cheerio** - Web scraping
- **PDF-Parse & PDFKit** - PDF processing
- **Playwright** - Browser automation
- **Multiple TTS Engines**:
  - Piper TTS (kokoro-js)
  - Edge TTS (node-edge-tts)
  - Google TTS API

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v14+)
- **npm** or **yarn**

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/jayasuriya1210/JudifyAI.git
cd JudifyAI
```

2. **Install dependencies for all packages**
```bash
npm run install:all
```

This command installs dependencies for:
- Root workspace
- Frontend (`frontend/`)
- Backend (`backend/`)

### Configuration

Create a `.env` file in the `backend/` directory with the following variables:

```env
# Server
PORT=5000

# Database
DATABASE_URL=./database.db

# JWT
JWT_SECRET=your_jwt_secret_key_here

# TTS Configuration
PIPER_ENABLED=true
EDGE_TTS_ENABLED=true

# Optional: API Keys
GOOGLE_TTS_API_KEY=your_api_key_here
```

### Running the Application

#### Development Mode (Both Frontend & Backend)
```bash
npm run dev
```

#### Development Mode (Frontend Only)
```bash
cd frontend
npm run dev
```

#### Development Mode (Backend Only)
```bash
cd backend
npm run dev
```

#### Production Build
```bash
# Frontend
cd frontend
npm run build

# Backend
cd backend
npm start
```

## 📚 API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user

### PDF Operations
- `POST /api/pdf/upload` - Upload a PDF file
- `GET /api/pdf/:id` - Retrieve PDF details
- `DELETE /api/pdf/:id` - Delete a PDF

### Text-to-Speech
- `POST /api/tts/generate` - Generate audio from text
- `GET /api/tts/health` - Check TTS service health

### Case Management
- `GET /api/cases` - Get all cases
- `POST /api/cases` - Create a new case
- `GET /api/cases/:id` - Get case details

### Summarization
- `POST /api/summary/generate` - Generate case summary

### Web Scraping
- `POST /api/scrape` - Scrape legal content from URL

### History & Notes
- `GET /api/history` - Get user's case history
- `GET /api/notes` - Get user's notes
- `POST /api/notes` - Create a new note

### Workflows
- `GET /api/workflow` - Get available workflows
- `POST /api/workflow/execute` - Execute a workflow

## 🗂️ Database Schema

The application uses SQLite with the following main tables:

- **users** - User accounts
- **cases** - Legal case documents
- **pdfs** - Uploaded PDF files
- **notes** - User annotations
- **history** - Case access history
- **audio** - Generated audio files
- **summaries** - Case summaries

## 🔐 Authentication

The application uses JWT (JSON Web Tokens) for authentication:

1. Users register or login
2. Backend validates credentials and issues a JWT token
3. Token is stored in browser localStorage
4. All subsequent requests include the token in the Authorization header

## 📝 Development Workflow

### Code Style
- **TypeScript** for type safety
- **ESLint** for code quality
- **Prettier** for code formatting

### Testing
```bash
# Frontend
cd frontend
npm run test
npm run test:watch

# Backend
cd backend
npm run test
```

### Linting
```bash
# Frontend
cd frontend
npm run lint
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License - see the LICENSE file for details.

## 👤 Author

**Jayasuriya** - [@jayasuriya1210](https://github.com/jayasuriya1210)

## 🙏 Acknowledgments

- Legal case data sources
- Open-source TTS libraries (Piper, Edge TTS)
- React and Node.js communities
- Shadcn/UI for beautiful components

## 📮 Support & Contact

For support, issues, or questions:
- Open an issue on [GitHub Issues](https://github.com/jayasuriya1210/JudifyAI/issues)
- Check existing documentation

---

**Made with ❤️ for the legal tech community**
