import { MigrationInterface, QueryRunner } from 'typeorm';

export class Billing1794468185250 implements MigrationInterface {
  name = 'Billing1794468185250';

  // Note: the shared enum `currency` (tariffs + transactions) is created once; TypeORM generated it twice.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "balance_accounts" ("user_id" integer NOT NULL, "rub" numeric(20,8) NOT NULL DEFAULT '0', "cny" numeric(20,8) NOT NULL DEFAULT '0', "usdt" numeric(20,8) NOT NULL DEFAULT '0', "seqno" integer NOT NULL DEFAULT '1', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_balance_accounts_non_negative" CHECK (rub >= 0 AND cny >= 0 AND usdt >= 0), CONSTRAINT "PK_eec97ddc561a6a01599a2540d80" PRIMARY KEY ("user_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "servers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "code" character varying(32) NOT NULL, "host" character varying(255) NOT NULL, "api_port" integer NOT NULL DEFAULT '440', "api_key" character varying(255) NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_1221f6d72317f04d424e080e511" UNIQUE ("code"), CONSTRAINT "UQ_5c3a4c806c820c579dad7aea858" UNIQUE ("host"), CONSTRAINT "PK_c0947efd9f3db2dcc010164d20b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."currency" AS ENUM('rub', 'cny', 'usdt')`);
    await queryRunner.query(
      `CREATE TABLE "tariffs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "duration_days" integer NOT NULL, "price" numeric(20,8) NOT NULL, "currency" "public"."currency" NOT NULL DEFAULT 'rub', "traffic_limit" bigint, "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_tariffs_price_non_negative" CHECK (price >= 0), CONSTRAINT "chk_tariffs_days_positive" CHECK (duration_days > 0), CONSTRAINT "PK_7f32baf8d8b4bb0cf4d7ac97741" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."transaction_type" AS ENUM('credit', 'debit')`);
    await queryRunner.query(
      `CREATE TYPE "public"."transaction_kind" AS ENUM('deposit', 'payment', 'refund', 'exchange', 'adjustment')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'completed', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "transactions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" integer NOT NULL, "amount" numeric(20,8) NOT NULL, "currency" "public"."currency" NOT NULL, "type" "public"."transaction_type" NOT NULL, "kind" "public"."transaction_kind" NOT NULL, "status" "public"."transaction_status" NOT NULL DEFAULT 'completed', "meta" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_transactions_amount_positive" CHECK (amount > 0), CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_843ef91438dec68148bec2df9d" ON "transactions"  ("user_id", "created_at") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."user_key_status" AS ENUM('active', 'expired')`);
    await queryRunner.query(
      `CREATE TABLE "user_keys" ("id" uuid NOT NULL, "user_id" integer NOT NULL, "tariff_id" uuid NOT NULL, "status" "public"."user_key_status" NOT NULL DEFAULT 'active', "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "traffic_limit" bigint, "traffic_used" bigint NOT NULL DEFAULT '0', "auto_renew_tariff_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a9df16797b63998be19abb49b34" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_56ea453269e27ae467c4b5e26e" ON "user_keys"  ("status", "expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_03bc99d540d17f2d6def72de3a" ON "user_keys"  ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "balance_accounts" ADD CONSTRAINT "FK_eec97ddc561a6a01599a2540d80" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_e9acc6efa76de013e8c1553ed2b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_keys" ADD CONSTRAINT "FK_03bc99d540d17f2d6def72de3ae" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_keys" ADD CONSTRAINT "FK_750bc9d79811943a9e4c963c2e8" FOREIGN KEY ("tariff_id") REFERENCES "tariffs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_keys" ADD CONSTRAINT "FK_f8be08de4fae7723677359b4bd9" FOREIGN KEY ("auto_renew_tariff_id") REFERENCES "tariffs"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_keys" DROP CONSTRAINT "FK_f8be08de4fae7723677359b4bd9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_keys" DROP CONSTRAINT "FK_750bc9d79811943a9e4c963c2e8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_keys" DROP CONSTRAINT "FK_03bc99d540d17f2d6def72de3ae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_e9acc6efa76de013e8c1553ed2b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "balance_accounts" DROP CONSTRAINT "FK_eec97ddc561a6a01599a2540d80"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_03bc99d540d17f2d6def72de3a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_56ea453269e27ae467c4b5e26e"`);
    await queryRunner.query(`DROP TABLE "user_keys"`);
    await queryRunner.query(`DROP TYPE "public"."user_key_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_843ef91438dec68148bec2df9d"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TYPE "public"."transaction_status"`);
    await queryRunner.query(`DROP TYPE "public"."transaction_kind"`);
    await queryRunner.query(`DROP TYPE "public"."transaction_type"`);
    await queryRunner.query(`DROP TABLE "tariffs"`);
    await queryRunner.query(`DROP TYPE "public"."currency"`);
    await queryRunner.query(`DROP TABLE "servers"`);
    await queryRunner.query(`DROP TABLE "balance_accounts"`);
  }
}
