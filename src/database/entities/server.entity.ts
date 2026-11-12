import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A node running xray-server-instance (VLESS + Reality).
 * Managed through its HTTP API: `POST http://{host}:{apiPort}/commands` with `X-API-Key`.
 * Reality params (public key, SNI, port, short id) are read from the node, not stored here.
 */
@Entity({ name: 'servers' })
export class Server {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Short location code, also used as an i18n key for the name/flag, e.g. `nl`. */
  @Column({ type: 'varchar', length: 32, unique: true })
  code: string;

  /** Public address used both for the API and in vless:// links. */
  @Column({ type: 'varchar', length: 255, unique: true })
  host: string;

  @Column({ name: 'api_port', type: 'int', default: 440 })
  apiPort: number;

  /** Value of the instance's API_KEY. Never expose it to users. */
  @Column({ name: 'api_key', type: 'varchar', length: 255, select: false })
  apiKey: string;

  /** New keys are created only on enabled servers. */
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
