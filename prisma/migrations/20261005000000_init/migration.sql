-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "login_id" TEXT,
    "password_hash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "recovery_email" TEXT,
    "recovery_phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "security_question" TEXT,
    "security_answer_hash" TEXT,
    "failed_recovery_attempts" INTEGER NOT NULL DEFAULT 0,
    "recovery_locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "recovery_code" TEXT NOT NULL,
    "reset_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chits" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chit_value" DECIMAL(12,2) NOT NULL,
    "monthly_chit_value" DECIMAL(12,2),
    "total_months" INTEGER NOT NULL,
    "total_members" INTEGER NOT NULL,
    "start_month" TEXT NOT NULL,
    "end_month" TEXT NOT NULL,
    "current_month" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chit_month_rules" (
    "id" TEXT NOT NULL,
    "chit_id" TEXT NOT NULL,
    "month_number" INTEGER NOT NULL,
    "month_name" TEXT NOT NULL,
    "pre_lift_payment" DECIMAL(12,2) NOT NULL,
    "post_lift_payment" DECIMAL(12,2) NOT NULL,
    "monthly_chit_value" DECIMAL(12,2) NOT NULL,
    "expected_lift_payout" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "chit_month_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "chit_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "ticket_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "join_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lift_details" (
    "id" TEXT NOT NULL,
    "chit_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "lift_month" INTEGER NOT NULL,
    "lift_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lift_amount_received" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remaining_payout" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payout_status" TEXT NOT NULL DEFAULT 'PAID',
    "lift_date" TIMESTAMP(3) NOT NULL,
    "payment_method" TEXT NOT NULL DEFAULT 'Cash',
    "reference_number" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Completed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "lift_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lift_payout_transactions" (
    "id" TEXT NOT NULL,
    "lift_id" TEXT NOT NULL,
    "chit_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "payment_method" TEXT NOT NULL DEFAULT 'Cash',
    "reference_number" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lift_payout_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_dues" (
    "id" TEXT NOT NULL,
    "chit_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "month_number" INTEGER NOT NULL,
    "month_name" TEXT NOT NULL,
    "due_amount" DECIMAL(12,2) NOT NULL,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance_amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "due_date" TIMESTAMP(3) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_dues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "monthly_due_id" TEXT NOT NULL,
    "chit_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "month_number" INTEGER NOT NULL,
    "month_name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" TEXT NOT NULL,
    "reference_no" TEXT,
    "notes" TEXT,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_hash_key" ON "sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "sessions_session_token_hash_idx" ON "sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_reset_token_key" ON "password_resets"("reset_token");

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

-- CreateIndex
CREATE INDEX "password_resets_reset_token_idx" ON "password_resets"("reset_token");

-- CreateIndex
CREATE INDEX "chits_status_idx" ON "chits"("status");

-- CreateIndex
CREATE INDEX "chit_month_rules_chit_id_idx" ON "chit_month_rules"("chit_id");

-- CreateIndex
CREATE UNIQUE INDEX "chit_month_rules_chit_id_month_number_key" ON "chit_month_rules"("chit_id", "month_number");

-- CreateIndex
CREATE INDEX "members_chit_id_idx" ON "members"("chit_id");

-- CreateIndex
CREATE INDEX "members_phone_idx" ON "members"("phone");

-- CreateIndex
CREATE INDEX "members_customer_name_idx" ON "members"("customer_name");

-- CreateIndex
CREATE UNIQUE INDEX "lift_details_member_id_key" ON "lift_details"("member_id");

-- CreateIndex
CREATE INDEX "lift_details_chit_id_idx" ON "lift_details"("chit_id");

-- CreateIndex
CREATE INDEX "lift_details_lift_month_idx" ON "lift_details"("lift_month");

-- CreateIndex
CREATE UNIQUE INDEX "lift_details_chit_id_lift_month_key" ON "lift_details"("chit_id", "lift_month");

-- CreateIndex
CREATE INDEX "lift_payout_transactions_lift_id_idx" ON "lift_payout_transactions"("lift_id");

-- CreateIndex
CREATE INDEX "lift_payout_transactions_chit_id_idx" ON "lift_payout_transactions"("chit_id");

-- CreateIndex
CREATE INDEX "lift_payout_transactions_member_id_idx" ON "lift_payout_transactions"("member_id");

-- CreateIndex
CREATE INDEX "monthly_dues_chit_id_month_number_idx" ON "monthly_dues"("chit_id", "month_number");

-- CreateIndex
CREATE INDEX "monthly_dues_member_id_idx" ON "monthly_dues"("member_id");

-- CreateIndex
CREATE INDEX "monthly_dues_status_idx" ON "monthly_dues"("status");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_dues_chit_id_member_id_month_number_key" ON "monthly_dues"("chit_id", "member_id", "month_number");

-- CreateIndex
CREATE INDEX "payments_monthly_due_id_idx" ON "payments"("monthly_due_id");

-- CreateIndex
CREATE INDEX "payments_chit_id_month_number_idx" ON "payments"("chit_id", "month_number");

-- CreateIndex
CREATE INDEX "payments_member_id_idx" ON "payments"("member_id");

-- CreateIndex
CREATE INDEX "payments_payment_date_idx" ON "payments"("payment_date");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chit_month_rules" ADD CONSTRAINT "chit_month_rules_chit_id_fkey" FOREIGN KEY ("chit_id") REFERENCES "chits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_chit_id_fkey" FOREIGN KEY ("chit_id") REFERENCES "chits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lift_details" ADD CONSTRAINT "lift_details_chit_id_fkey" FOREIGN KEY ("chit_id") REFERENCES "chits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lift_details" ADD CONSTRAINT "lift_details_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lift_payout_transactions" ADD CONSTRAINT "lift_payout_transactions_lift_id_fkey" FOREIGN KEY ("lift_id") REFERENCES "lift_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lift_payout_transactions" ADD CONSTRAINT "lift_payout_transactions_chit_id_fkey" FOREIGN KEY ("chit_id") REFERENCES "chits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lift_payout_transactions" ADD CONSTRAINT "lift_payout_transactions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_dues" ADD CONSTRAINT "monthly_dues_chit_id_fkey" FOREIGN KEY ("chit_id") REFERENCES "chits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_dues" ADD CONSTRAINT "monthly_dues_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_monthly_due_id_fkey" FOREIGN KEY ("monthly_due_id") REFERENCES "monthly_dues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_chit_id_fkey" FOREIGN KEY ("chit_id") REFERENCES "chits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
