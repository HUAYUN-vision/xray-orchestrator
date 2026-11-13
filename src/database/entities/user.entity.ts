import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintToNumber } from '../transformers';

/** Telegram user of the bot. */
@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'telegram_id', type: 'bigint', unique: true, transformer: bigintToNumber })
  telegramId: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  username: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 255 })
  firstName: string;

  /** Explicitly chosen language; `null` means "follow Telegram's language_code". */
  @Column({ type: 'varchar', length: 8, nullable: true })
  language: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
