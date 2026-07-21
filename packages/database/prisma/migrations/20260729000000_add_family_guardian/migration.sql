-- Family & Guardian Intelligence Platform (P2-D04). Seven tenant-owned tables: the
-- household (family), the guardian, the many-to-many student–guardian relationship,
-- the append-only consent ledger, prioritized emergency contacts, and the per-family
-- communication and intelligence profiles. Every table is tenant-isolated by FORCE
-- ROW LEVEL SECURITY with the standard tenant_isolation policy.

-- ---------------------------------------------------------------------------------
CREATE TABLE "family" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "family_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "members" JSONB NOT NULL DEFAULT '[]',
    "primary_contact_person_id" UUID,
    "addresses" JSONB NOT NULL DEFAULT '[]',
    "preferred_language" TEXT,
    "preferred_channel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "merged_into_family_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "family_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "family_tenant_id_family_number_key" ON "family"("tenant_id", "family_number");
CREATE INDEX "family_tenant_id_idx" ON "family"("tenant_id");
CREATE INDEX "family_tenant_id_organization_id_idx" ON "family"("tenant_id", "organization_id");
ALTER TABLE "family" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "family"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "guardian" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "legal_authority" TEXT NOT NULL DEFAULT 'none',
    "verification" TEXT NOT NULL DEFAULT 'unverified',
    "verified_on" DATE,
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "availability_note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "guardian_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "guardian_tenant_id_person_id_organization_id_key" ON "guardian"("tenant_id", "person_id", "organization_id");
CREATE INDEX "guardian_tenant_id_idx" ON "guardian"("tenant_id");
CREATE INDEX "guardian_tenant_id_organization_id_idx" ON "guardian"("tenant_id", "organization_id");
CREATE INDEX "guardian_tenant_id_person_id_idx" ON "guardian"("tenant_id", "person_id");
ALTER TABLE "guardian" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "guardian"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "student_guardian_relationship" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "relationship_type" TEXT NOT NULL,
    "responsibilities" JSONB NOT NULL DEFAULT '{}',
    "emergency_priority" INTEGER,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "student_guardian_relationship_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "student_guardian_relationship_tenant_id_idx" ON "student_guardian_relationship"("tenant_id");
CREATE INDEX "student_guardian_relationship_tenant_id_student_id_idx" ON "student_guardian_relationship"("tenant_id", "student_id");
CREATE INDEX "student_guardian_relationship_tenant_id_guardian_id_idx" ON "student_guardian_relationship"("tenant_id", "guardian_id");
ALTER TABLE "student_guardian_relationship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_guardian_relationship" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "student_guardian_relationship"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "family_consent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "consent_type" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "policy_id" UUID,
    "note" TEXT,
    "effective_on" DATE NOT NULL,
    "expires_on" DATE,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "family_consent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "family_consent_tenant_id_student_id_consent_type_version_key" ON "family_consent"("tenant_id", "student_id", "consent_type", "version");
CREATE INDEX "family_consent_tenant_id_idx" ON "family_consent"("tenant_id");
CREATE INDEX "family_consent_tenant_id_student_id_idx" ON "family_consent"("tenant_id", "student_id");
CREATE INDEX "family_consent_tenant_id_organization_id_idx" ON "family_consent"("tenant_id", "organization_id");
ALTER TABLE "family_consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_consent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "family_consent"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "emergency_contact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL,
    "relationship_label" TEXT NOT NULL,
    "phone" TEXT,
    "availability_note" TEXT,
    "authorizations" JSONB NOT NULL DEFAULT '{}',
    "contact_history" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "emergency_contact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "emergency_contact_tenant_id_idx" ON "emergency_contact"("tenant_id");
CREATE INDEX "emergency_contact_tenant_id_student_id_idx" ON "emergency_contact"("tenant_id", "student_id");
CREATE INDEX "emergency_contact_tenant_id_organization_id_idx" ON "emergency_contact"("tenant_id", "organization_id");
ALTER TABLE "emergency_contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emergency_contact" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "emergency_contact"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "communication_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "preferred_language" TEXT,
    "preferred_channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "schedules" JSONB NOT NULL DEFAULT '[]',
    "notification_preferences" JSONB NOT NULL DEFAULT '[]',
    "accessibility_requirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "communication_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "communication_profile_tenant_id_family_id_key" ON "communication_profile"("tenant_id", "family_id");
CREATE INDEX "communication_profile_tenant_id_idx" ON "communication_profile"("tenant_id");
CREATE INDEX "communication_profile_tenant_id_organization_id_idx" ON "communication_profile"("tenant_id", "organization_id");
ALTER TABLE "communication_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "communication_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------------------------------------------------------------------------------
CREATE TABLE "family_intelligence_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "indicators" JSONB NOT NULL DEFAULT '{}',
    "interactions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "family_intelligence_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "family_intelligence_profile_tenant_id_family_id_key" ON "family_intelligence_profile"("tenant_id", "family_id");
CREATE INDEX "family_intelligence_profile_tenant_id_idx" ON "family_intelligence_profile"("tenant_id");
CREATE INDEX "family_intelligence_profile_tenant_id_organization_id_idx" ON "family_intelligence_profile"("tenant_id", "organization_id");
ALTER TABLE "family_intelligence_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_intelligence_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "family_intelligence_profile"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
