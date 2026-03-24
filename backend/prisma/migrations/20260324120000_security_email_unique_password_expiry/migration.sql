-- AlterTable: add password_changed_at column
ALTER TABLE "users" ADD COLUMN "password_changed_at" TIMESTAMP(3);

-- CreateIndex: enforce unique email (verify no duplicates exist before applying)
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
