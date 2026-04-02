# Nail Salon System Design

## System Actors
- Guest Customer
- Receptionist
- Nail Technician
- Manager/Admin
- Platform Scheduler
- Security Operator

## Top Use Cases
- Book appointment
- Reschedule appointment
- Cancel appointment
- Manage service catalog
- View operational dashboard
- Generate daily summary report

## Functional Requirements
- Customer profile create/update/search/deactivate
- Service catalog with duration and price
- Appointment lifecycle with overlap prevention
- Daily schedule listing for admin view
- Reports summary for appointment and revenue estimates
- Immutable-like action logs for changes

## Non-Functional Requirements
- Responsive UI for mobile and desktop
- Standardized API response envelope
- Role and signature checks on backend routes
- Rate limiting at edge gateway
- Backup and restore operational procedure

## Class Diagram (Mermaid)

```mermaid
classDiagram
  class Customer {
    +string customerId
    +string fullName
    +string phone
    +string email
    +string consentStatus
    +bool active
  }

  class Service {
    +string serviceId
    +string name
    +number durationMin
    +number price
    +string category
    +bool active
  }

  class Appointment {
    +string appointmentId
    +string customerId
    +string serviceId
    +string staffId
    +string date
    +string startTime
    +string endTime
    +string status
  }

  class AppointmentStatusHistory {
    +string historyId
    +string appointmentId
    +string fromStatus
    +string toStatus
    +string changedAt
  }

  class AuditLog {
    +string logId
    +string action
    +string entityType
    +string entityId
    +string actor
    +string detailsJson
  }

  Customer "1" --> "*" Appointment
  Service "1" --> "*" Appointment
  Appointment "1" --> "*" AppointmentStatusHistory
  Appointment --> AuditLog
```

## Activity Diagram (Booking)

```mermaid
flowchart TD
  A[Customer opens booking page] --> B[Select service and date]
  B --> C[Load available slots]
  C --> D[Submit booking request]
  D --> E[Worker validates rate limit and challenge]
  E -->|Blocked| F[Return 429 or challenge failure]
  E -->|Allowed| G[Worker signs envelope]
  G --> H[Apps Script validates signature]
  H --> I[Validate business rules]
  I -->|Invalid| J[Return error message]
  I -->|Valid| K[Write appointment row]
  K --> L[Write status history and log]
  L --> M[Return confirmation]
```

## Hosting Decision
Cloudflare Pages is preferred over GitHub Pages for this solution because it has stronger integrated security controls and native edge execution for request filtering and rate limiting.
