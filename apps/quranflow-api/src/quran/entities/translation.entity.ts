import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Ayah } from './ayah.entity';

/**
 * Translation Entity
 * Stores translations of Quranic verses in different languages.
 * Supports multiple translations per ayah per language.
 */
@Entity('translations')
@Index(['ayah_id', 'language_code']) // Composite index for efficient lookups
@Index(['language_code']) // Index for language-based queries
export class Translation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  ayah_id: string; // FK to ayahs.id

  @Column({ type: 'varchar', length: 10 })
  language_code: string; // 'en', 'ur', 'bn', etc.

  @Column({ type: 'text' })
  text: string; // Translation text

  @Column({ type: 'varchar', length: 255, nullable: true })
  source?: string; // Translation source/translator name

  @Column({ type: 'varchar', length: 255, nullable: true })
  translator?: string; // Specific translator name

  // Attribution metadata
  @Column({ type: 'jsonb', nullable: true })
  attribution?: {
    source?: string;
    translator?: string;
    license?: string;
    url?: string;
  };

  // Relationships
  @ManyToOne(() => Ayah, (ayah) => ayah.translations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ayah_id' })
  ayah: Ayah;

  // Audit fields
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

