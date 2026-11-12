import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1794466482290 implements MigrationInterface {
  name = 'Init1794466482290';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" integer GENERATED ALWAYS AS IDENTITY NOT NULL, "telegram_id" bigint NOT NULL, "username" character varying(32), "first_name" character varying(255) NOT NULL, "language" character varying(8), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_1a1e4649fd31ea6ec6b025c7bfc" UNIQUE ("telegram_id"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
