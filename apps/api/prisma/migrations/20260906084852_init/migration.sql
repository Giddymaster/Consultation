-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'CONSULTANT', 'CLIENT', 'CONTENT_MANAGER', 'FINANCE_MANAGER');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'CONFIRMED', 'RESCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'NO_SHOW', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PROCESSING', 'PARTIALLY_PAID', 'PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('FULL_PAYMENT', 'DEPOSIT', 'BALANCE_PAYMENT', 'PRODUCT_ORDER');

-- CreateEnum
CREATE TYPE "PaymentModel" AS ENUM ('FULL_PAYMENT', 'FIXED_DEPOSIT', 'PERCENTAGE_DEPOSIT', 'FREE');

-- CreateEnum
CREATE TYPE "MeetingProvider" AS ENUM ('ZOOM', 'GOOGLE_MEET', 'MICROSOFT_TEAMS', 'IN_PERSON', 'PHONE', 'MANUAL');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('PENDING', 'CREATED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('DIGITAL', 'PHYSICAL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'FULFILLED', 'SHIPPED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'VOID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('KES', 'USD', 'NGN', 'GHS', 'ZAR');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" VARCHAR(80) NOT NULL,
    "lastName" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(32),
    "company" VARCHAR(160),
    "jobTitle" VARCHAR(160),
    "avatarUrl" VARCHAR(2048),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Nairobi',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" "RoleName" NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "description" VARCHAR(320),
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "familyId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "replacedById" UUID,
    "userAgent" VARCHAR(320),
    "ip" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clientCode" VARCHAR(20) NOT NULL,
    "industry" VARCHAR(120),
    "companySize" VARCHAR(60),
    "country" VARCHAR(2),
    "city" VARCHAR(120),
    "internalNotes" TEXT,
    "source" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultant_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "biography" TEXT NOT NULL,
    "specialties" TEXT[],
    "qualifications" TEXT[],
    "languages" TEXT[],
    "yearsExperience" INTEGER NOT NULL DEFAULT 0,
    "linkedinUrl" VARCHAR(2048),
    "websiteUrl" VARCHAR(2048),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Nairobi',
    "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "isAcceptingBookings" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "averageRating" DOUBLE PRECISION,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "completedSessions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "consultant_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "icon" VARCHAR(60),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "categoryId" UUID NOT NULL,
    "shortDescription" VARCHAR(320) NOT NULL,
    "fullDescription" TEXT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'KES',
    "paymentModel" "PaymentModel" NOT NULL DEFAULT 'FULL_PAYMENT',
    "depositAmount" INTEGER,
    "depositPercentBps" INTEGER,
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "meetingProviders" "MeetingProvider"[],
    "preparationNotes" TEXT,
    "cancellationPolicy" TEXT,
    "reschedulePolicy" TEXT,
    "cancellationWindowHours" INTEGER NOT NULL DEFAULT 24,
    "rescheduleWindowHours" INTEGER NOT NULL DEFAULT 24,
    "leadTimeHours" INTEGER NOT NULL DEFAULT 12,
    "bookingHorizonDays" INTEGER NOT NULL DEFAULT 60,
    "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 10,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "heroImageUrl" VARCHAR(2048),
    "icon" VARCHAR(60),
    "seoTitle" VARCHAR(160),
    "seoDescription" VARCHAR(320),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_durations" (
    "id" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "minutes" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "label" VARCHAR(60),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "service_durations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_consultants" (
    "serviceId" UUID NOT NULL,
    "consultantId" UUID NOT NULL,

    CONSTRAINT "service_consultants_pkey" PRIMARY KEY ("serviceId","consultantId")
);

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" UUID NOT NULL,
    "consultantId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_blackouts" (
    "id" UUID NOT NULL,
    "consultantId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_blackouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_connections" (
    "id" UUID NOT NULL,
    "consultantId" UUID NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "accountId" VARCHAR(200) NOT NULL,
    "accountEmail" VARCHAR(254) NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "calendarId" VARCHAR(320),
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "externalEventId" VARCHAR(320) NOT NULL,
    "htmlLink" VARCHAR(2048),
    "iCalUid" VARCHAR(320),
    "status" VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED',
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_busy_blocks" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "consultantId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_busy_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(24) NOT NULL,
    "clientId" UUID NOT NULL,
    "consultantId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "blockStartAt" TIMESTAMPTZ(3) NOT NULL,
    "blockEndAt" TIMESTAMPTZ(3) NOT NULL,
    "currency" "Currency" NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "amountDueNow" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "discountCode" VARCHAR(40),
    "meetingProvider" "MeetingProvider" NOT NULL,
    "objective" TEXT,
    "notes" TEXT,
    "cancellationReason" VARCHAR(500),
    "cancelledAt" TIMESTAMPTZ(3),
    "confirmedAt" TIMESTAMPTZ(3),
    "holdExpiresAt" TIMESTAMPTZ(3),
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_events" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus" NOT NULL,
    "reason" VARCHAR(500),
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_meetings" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "provider" "MeetingProvider" NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'PENDING',
    "externalMeetingId" VARCHAR(320),
    "joinUrl" VARCHAR(2048),
    "hostUrl" VARCHAR(2048),
    "passcode" VARCHAR(64),
    "dialInNumber" VARCHAR(64),
    "startTime" TIMESTAMPTZ(3),
    "endTime" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "lastAttemptAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "video_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_sessions" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "actualMinutes" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "consultation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_notes" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "objective" TEXT,
    "discussionSummary" TEXT,
    "keyFindings" TEXT,
    "recommendations" TEXT,
    "actionItems" JSONB NOT NULL DEFAULT '[]',
    "followUpDate" DATE,
    "privateNotes" TEXT,
    "sharedWithClient" BOOLEAN NOT NULL DEFAULT false,
    "lastEditedBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "session_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "sessionId" UUID,
    "storageKey" VARCHAR(512) NOT NULL,
    "fileName" VARCHAR(320) NOT NULL,
    "mimeType" VARCHAR(160) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "visibleToClient" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "providerTransactionId" VARCHAR(120),
    "bookingId" UUID,
    "orderId" UUID,
    "userId" UUID,
    "purpose" "PaymentPurpose" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "currency" "Currency" NOT NULL,
    "amount" INTEGER NOT NULL,
    "feeAmount" INTEGER NOT NULL DEFAULT 0,
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "channel" VARCHAR(40),
    "cardLast4" VARCHAR(4),
    "cardBrand" VARCHAR(40),
    "customerEmail" VARCHAR(254) NOT NULL,
    "authorizationCode" VARCHAR(120),
    "gatewayResponse" VARCHAR(320),
    "metadata" JSONB,
    "paidAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "eventId" VARCHAR(200) NOT NULL,
    "eventType" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ(3),
    "status" VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "providerRefundId" VARCHAR(120),
    "amount" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(500) NOT NULL,
    "merchantNote" VARCHAR(500),
    "initiatedBy" UUID,
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "bookingId" UUID,
    "orderId" UUID,
    "userId" UUID,
    "currency" "Currency" NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "issuedAt" TIMESTAMPTZ(3),
    "dueAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "consultantId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(160),
    "body" TEXT NOT NULL,
    "serviceRating" INTEGER,
    "consultantRating" INTEGER,
    "communicationRating" INTEGER,
    "valueRating" INTEGER,
    "displayName" VARCHAR(120),
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT true,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "moderationNote" VARCHAR(1000),
    "moderatedBy" UUID,
    "moderatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "icon" VARCHAR(60),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "categoryId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "shortDescription" VARCHAR(400),
    "author" VARCHAR(160),
    "coverImageUrl" VARCHAR(2048),
    "galleryUrls" TEXT[],
    "price" INTEGER NOT NULL,
    "compareAtPrice" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'KES',
    "sku" VARCHAR(64),
    "type" "ProductType" NOT NULL DEFAULT 'DIGITAL',
    "stock" INTEGER,
    "isbn" VARCHAR(20),
    "pages" INTEGER,
    "publishedYear" INTEGER,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "seoTitle" VARCHAR(160),
    "seoDescription" VARCHAR(320),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_assets" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "storageKey" VARCHAR(512) NOT NULL,
    "fileName" VARCHAR(320) NOT NULL,
    "mimeType" VARCHAR(160) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "version" VARCHAR(40),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "digital_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(24) NOT NULL,
    "userId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "currency" "Currency" NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "shipping" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "shippingAddress" JSONB,
    "notes" TEXT,
    "idempotencyKey" VARCHAR(80),
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "unitAmount" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "download_entitlements" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "maxDownloads" INTEGER,
    "expiresAt" TIMESTAMPTZ(3),
    "lastDownloadAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "download_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "categoryId" UUID NOT NULL,
    "excerpt" VARCHAR(400) NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "featuredImageUrl" VARCHAR(2048),
    "authorId" UUID,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(3),
    "readingMinutes" INTEGER NOT NULL DEFAULT 5,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" VARCHAR(160),
    "seoDescription" VARCHAR(320),
    "isJournal" BOOLEAN NOT NULL DEFAULT false,
    "journalVolume" VARCHAR(40),
    "journalIssue" VARCHAR(40),
    "doi" VARCHAR(120),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "href" VARCHAR(500),
    "metadata" JSONB,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "recipient" VARCHAR(254) NOT NULL,
    "template" VARCHAR(60) NOT NULL,
    "subject" VARCHAR(320) NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" VARCHAR(40) NOT NULL,
    "providerMessageId" VARCHAR(320),
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "relatedEntity" VARCHAR(60),
    "relatedEntityId" UUID,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "entityId" VARCHAR(64),
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(320),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_jobs" (
    "id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "runAt" TIMESTAMPTZ(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" VARCHAR(200),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "lockedBy" VARCHAR(80),
    "lockedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "description" VARCHAR(320),
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "credentials" TEXT,
    "config" JSONB,
    "accountLabel" VARCHAR(200),
    "connectedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "lastCheckedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(32),
    "company" VARCHAR(160),
    "subject" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'NEW',
    "handledBy" UUID,
    "handledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_tokenHash_key" ON "verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "verification_tokens_userId_purpose_idx" ON "verification_tokens"("userId", "purpose");

-- CreateIndex
CREATE INDEX "verification_tokens_expiresAt_idx" ON "verification_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "client_profiles_userId_key" ON "client_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "client_profiles_clientCode_key" ON "client_profiles"("clientCode");

-- CreateIndex
CREATE INDEX "client_profiles_clientCode_idx" ON "client_profiles"("clientCode");

-- CreateIndex
CREATE UNIQUE INDEX "consultant_profiles_userId_key" ON "consultant_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "consultant_profiles_slug_key" ON "consultant_profiles"("slug");

-- CreateIndex
CREATE INDEX "consultant_profiles_slug_idx" ON "consultant_profiles"("slug");

-- CreateIndex
CREATE INDEX "consultant_profiles_isPublished_sortOrder_idx" ON "consultant_profiles"("isPublished", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_slug_key" ON "service_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE INDEX "services_slug_idx" ON "services"("slug");

-- CreateIndex
CREATE INDEX "services_status_sortOrder_idx" ON "services"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "services_categoryId_idx" ON "services"("categoryId");

-- CreateIndex
CREATE INDEX "service_durations_serviceId_idx" ON "service_durations"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "service_durations_serviceId_minutes_key" ON "service_durations"("serviceId", "minutes");

-- CreateIndex
CREATE INDEX "service_consultants_consultantId_idx" ON "service_consultants"("consultantId");

-- CreateIndex
CREATE INDEX "availability_rules_consultantId_weekday_idx" ON "availability_rules"("consultantId", "weekday");

-- CreateIndex
CREATE INDEX "availability_blackouts_consultantId_startAt_endAt_idx" ON "availability_blackouts"("consultantId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "calendar_connections_consultantId_idx" ON "calendar_connections"("consultantId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_connections_consultantId_provider_accountId_key" ON "calendar_connections"("consultantId", "provider", "accountId");

-- CreateIndex
CREATE INDEX "calendar_events_bookingId_idx" ON "calendar_events"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_connectionId_externalEventId_key" ON "calendar_events"("connectionId", "externalEventId");

-- CreateIndex
CREATE INDEX "calendar_busy_blocks_consultantId_startAt_endAt_idx" ON "calendar_busy_blocks"("consultantId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "calendar_busy_blocks_connectionId_idx" ON "calendar_busy_blocks"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_reference_key" ON "bookings"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_idempotencyKey_key" ON "bookings"("idempotencyKey");

-- CreateIndex
CREATE INDEX "bookings_startAt_idx" ON "bookings"("startAt");

-- CreateIndex
CREATE INDEX "bookings_consultantId_startAt_idx" ON "bookings"("consultantId", "startAt");

-- CreateIndex
CREATE INDEX "bookings_clientId_idx" ON "bookings"("clientId");

-- CreateIndex
CREATE INDEX "bookings_status_startAt_idx" ON "bookings"("status", "startAt");

-- CreateIndex
CREATE INDEX "bookings_paymentStatus_idx" ON "bookings"("paymentStatus");

-- CreateIndex
CREATE INDEX "bookings_serviceId_idx" ON "bookings"("serviceId");

-- CreateIndex
CREATE INDEX "bookings_reference_idx" ON "bookings"("reference");

-- CreateIndex
CREATE INDEX "booking_status_events_bookingId_createdAt_idx" ON "booking_status_events"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "video_meetings_bookingId_key" ON "video_meetings"("bookingId");

-- CreateIndex
CREATE INDEX "video_meetings_status_idx" ON "video_meetings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_sessions_bookingId_key" ON "consultation_sessions"("bookingId");

-- CreateIndex
CREATE INDEX "consultation_sessions_status_idx" ON "consultation_sessions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "session_notes_sessionId_key" ON "session_notes"("sessionId");

-- CreateIndex
CREATE INDEX "attachments_sessionId_idx" ON "attachments"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_providerTransactionId_key" ON "payments"("providerTransactionId");

-- CreateIndex
CREATE INDEX "payments_reference_idx" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_bookingId_idx" ON "payments"("bookingId");

-- CreateIndex
CREATE INDEX "payments_orderId_idx" ON "payments"("orderId");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

-- CreateIndex
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");

-- CreateIndex
CREATE INDEX "webhook_events_eventType_idx" ON "webhook_events"("eventType");

-- CreateIndex
CREATE INDEX "webhook_events_createdAt_idx" ON "webhook_events"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_eventId_key" ON "webhook_events"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_reference_key" ON "refunds"("reference");

-- CreateIndex
CREATE INDEX "refunds_paymentId_idx" ON "refunds"("paymentId");

-- CreateIndex
CREATE INDEX "refunds_status_idx" ON "refunds"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_bookingId_key" ON "invoices"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_orderId_key" ON "invoices"("orderId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_userId_idx" ON "invoices"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_bookingId_key" ON "reviews"("bookingId");

-- CreateIndex
CREATE INDEX "reviews_status_createdAt_idx" ON "reviews"("status", "createdAt");

-- CreateIndex
CREATE INDEX "reviews_consultantId_status_idx" ON "reviews"("consultantId", "status");

-- CreateIndex
CREATE INDEX "reviews_serviceId_status_idx" ON "reviews"("serviceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_slug_key" ON "product_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_slug_idx" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_status_isFeatured_idx" ON "products"("status", "isFeatured");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "digital_assets_productId_key" ON "digital_assets"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_reference_key" ON "orders"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotencyKey_key" ON "orders"("idempotencyKey");

-- CreateIndex
CREATE INDEX "orders_userId_idx" ON "orders"("userId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");

-- CreateIndex
CREATE INDEX "download_entitlements_userId_idx" ON "download_entitlements"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "download_entitlements_userId_productId_orderId_key" ON "download_entitlements"("userId", "productId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "article_categories_slug_key" ON "article_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "articles_slug_idx" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "articles_status_publishedAt_idx" ON "articles"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "articles_categoryId_idx" ON "articles"("categoryId");

-- CreateIndex
CREATE INDEX "articles_isJournal_status_idx" ON "articles"("isJournal", "status");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "email_logs_status_idx" ON "email_logs"("status");

-- CreateIndex
CREATE INDEX "email_logs_recipient_idx" ON "email_logs"("recipient");

-- CreateIndex
CREATE INDEX "email_logs_template_idx" ON "email_logs"("template");

-- CreateIndex
CREATE INDEX "email_logs_createdAt_idx" ON "email_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_jobs_dedupeKey_key" ON "scheduled_jobs"("dedupeKey");

-- CreateIndex
CREATE INDEX "scheduled_jobs_status_runAt_idx" ON "scheduled_jobs"("status", "runAt");

-- CreateIndex
CREATE INDEX "scheduled_jobs_type_idx" ON "scheduled_jobs"("type");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_key_key" ON "integrations"("key");

-- CreateIndex
CREATE INDEX "contact_messages_status_createdAt_idx" ON "contact_messages"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_profiles" ADD CONSTRAINT "consultant_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_durations" ADD CONSTRAINT "service_durations_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_consultants" ADD CONSTRAINT "service_consultants_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_consultants" ADD CONSTRAINT "service_consultants_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "consultant_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "consultant_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_blackouts" ADD CONSTRAINT "availability_blackouts_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "consultant_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "consultant_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "calendar_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "consultant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_events" ADD CONSTRAINT "booking_status_events_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_meetings" ADD CONSTRAINT "video_meetings_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_sessions" ADD CONSTRAINT "consultation_sessions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "consultation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "consultation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "consultant_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_assets" ADD CONSTRAINT "digital_assets_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_entitlements" ADD CONSTRAINT "download_entitlements_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "article_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
