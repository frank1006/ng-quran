import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  Index,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Surah } from './surah.entity';
import { Translation } from './translation.entity';

/**
 * Ayah (Verse) Entity
 * Represents a single verse of the Quran.
 * Quran text is immutable - never update arabic_text.
 */
@Entity('ayahs')
@Index(['surah_id', 'ayah_number'], { unique: true }) // Composite unique index
export class Ayah {
  @PrimaryGeneratedColumn('uuid')
  id: string; // UUID for flexibility

  @Column({ type: 'int' })
  @Index()
  surah_id: number; // FK to surahs.id

  @Column({ type: 'int' })
  ayah_number: number; // Verse number within the surah (1-based)

  @Column({ type: 'text' })
  arabic_text: string; // Uthmani script (primary Arabic text)

  @Column({ type: 'text', nullable: true })
  arabic_text_simple?: string; // Simple Arabic script

  // Mushaf metadata
  @Column({ type: 'int', nullable: true })
  page?: number; // Page number in the Mushaf

  @Column({ type: 'int', nullable: true })
  juz?: number; // Juz number (1-30)

  @Column({ type: 'int', nullable: true })
  hizb?: number; // Hizb number

  @Column({ type: 'int', nullable: true })
  rub_el_hizb?: number; // Rub el Hizb number

  @Column({ type: 'int', nullable: true })
  ruku?: number; // Ruku number

  @Column({ type: 'int', nullable: true })
  manzil?: number; // Manzil number

  @Column({ type: 'varchar', length: 50, nullable: true })
  sajdah_type?: string | null; // Sajdah type if applicable

  @Column({ type: 'int', nullable: true })
  sajdah_number?: number | null; // Sajdah number

  // Relationships
  @ManyToOne(() => Surah, (surah) => surah.ayahs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'surah_id' })
  surah: Surah;

  @OneToMany(() => Translation, (translation) => translation.ayah, { cascade: true })
  translations: Translation[];

  // Metadata for future AI/RAG expansion
  @Column({ type: 'uuid', nullable: true })
  ayah_uuid?: string; // For vector DB mapping (future)

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>; // For embeddings and AI metadata (future)

  // Audit fields
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

