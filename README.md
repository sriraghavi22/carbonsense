# Project Setup Guide

This project contains:

* **Backend**: Python (Uvicorn)
* **Frontend**: React (Vite)

---

## 🔧 Backend Setup (Python)

### 1. Create a virtual environment (recommended)

From the **project root directory**:

```bash
python -m venv .venv
```

Activate it:

**macOS / Linux**

```bash
source .venv/bin/activate
```

**Windows**

```bash
.venv\Scripts\activate
```

---

### 2. Create `.env` file in root directory

Create a file named `.env` in the **project root** and add:

```env
OPENWEATHER_API_KEY=
ELECTRICITYMAPS_API_KEY=
WATTTIME_API_KEY=
```

(Add your actual API keys later)

---

### 3. Install backend dependencies

```bash
pip install -r requirements.txt
```

---

### 4. Run the backend server

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend will run at:

```
http://localhost:8000
```

---

## 🎨 Frontend Setup (React + Vite)

### 1. Go to frontend directory

```bash
cd frontend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run the frontend

```bash
npm run dev
```

Frontend will run at:

```
http://localhost:5173
```

---

## ✅ Notes

* Ensure **Python** and **Node.js (npm)** are installed
* Always activate the virtual environment before running backend
* `.env` files are ignored by git for security
