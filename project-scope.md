# AI-Powered Ticket Management System

## Problem

We receive hundreds of support emails daily. Our agents manually read, classify, and respond to each ticket—which is slow and leads to impersonal, canned responses.

## Solution

Build a ticket management system that uses AI to automatically classify, respond to, and route support tickets—delivering faster, more personalized responses to students while freeing up agents for complex issues.

## Features

- Receive support emails and create tickets
- Auto-generate human-friendly responses using a knowledge base
- Ticket list with filtering and sorting
- Ticket detail view
- AI-powered ticket classification
- AI summaries
- AI-suggested replies
- User management (admin only)
- Dashboard to view and manage all tickets

## Requirements

### Ticket Statuses

Each ticket can have one of the following statuses:

- **Open** — Ticket is active and awaiting response or action
- **Resolved** — Agent has addressed the issue
- **Closed** — Ticket is finalized

### Ticket Categories

Each ticket belongs to a single category:

- General Question
- Technical Question
- Refund Request

### User Roles

#### Admin (default account created on deployment)

- Create and manage agent accounts
- Assign tickets to agents
- Manage users and system settings

#### Agent

- View assigned tickets
- Respond to customers
- Update ticket status
- Resolve or close tickets

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React with TypeScript |
| **Backend** | Node.js with Express |
| **Database** | PostgreSQL |
| **ORM** | Prisma |
| **AI** | OpenAI API |
| **Auth** | JWT-based authentication |
| **Email** | Nodemailer (outbound) |