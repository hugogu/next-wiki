ALTER TYPE "public"."tag_mutation_kind" ADD VALUE 'merge';--> statement-breakpoint
ALTER TABLE "tag_mutations" ADD COLUMN "target_tag_id" uuid;--> statement-breakpoint
ALTER TABLE "tag_mutations" ADD CONSTRAINT "tag_mutations_target_tag_id_tags_id_fk" FOREIGN KEY ("target_tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;