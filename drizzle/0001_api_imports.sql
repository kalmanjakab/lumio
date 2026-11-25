CREATE TABLE "api_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key_hash" text,
	"content_hash" text NOT NULL,
	"material_id" uuid,
	"card_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_imports_idempotency_key_hash_unique" UNIQUE("idempotency_key_hash")
);
--> statement-breakpoint
ALTER TABLE "api_imports" ADD CONSTRAINT "api_imports_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_imports_content_idx" ON "api_imports" USING btree ("content_hash","created_at");