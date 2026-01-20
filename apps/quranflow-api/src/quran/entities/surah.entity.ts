import {
  Entity,
  PrimaryColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Ayah } from './ayah.entity';

/**
 * Surah (Chapter) Entity
 * Represents a chapter of the Quran.
 * Quran text is immutable - never update arabic_text or related fields.
 */
@Entity('surahs')
export class Surah {
  @PrimaryColumn({ type: 'int' })
  id: number; // 1-114

  @Column({ type: 'varchar', length: 255 })
  name_ar: string; // Arabic name

  @Column({ type: 'varchar', length: 255 })
  name_en: string; // English name

  @Column({ type: 'varchar', length: 255, nullable: true })
  name_ar_long?: string; // Long Arabic name

  @Column({ type: 'varchar', length: 50 })
  revelation_type: 'Mecca' | 'Madina'; // Revelation place

  @Column({ type: 'int' })
  ayah_count: number; // Total number of ayahs in this surah

  @Column({ type: 'varchar', length: 255, nullable: true })
  transliteration?: string; // English transliteration

  // Relationships
  @OneToMany(() => Ayah, (ayah) => ayah.surah)
  ayahs: Ayah[];

  // Metadata for future AI/RAG expansion
  @Column({ type: 'uuid', nullable: true })
  surah_uuid?: string; // For vector DB mapping (future)

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>; // For embeddings and AI metadata (future)

  // Audit fields
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

