import { Type } from 'class-transformer';
import {
  IsBoolean, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class PdfColorSchemeDto {
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Couleur hex invalide (ex: #D8372B)' })
  primary?: string;

  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Couleur hex invalide' })
  dark?: string;

  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Couleur hex invalide' })
  gray?: string;

  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Couleur hex invalide' })
  lightGray?: string;

  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Couleur hex invalide' })
  border?: string;

  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Couleur hex invalide' })
  headerBg?: string;

  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Couleur hex invalide' })
  rowAlt?: string;
}

export class PdfFontsDto {
  @IsOptional() @IsNumber() @Min(5) @Max(24)
  titleSize?: number;

  @IsOptional() @IsNumber() @Min(5) @Max(24)
  subtitleSize?: number;

  @IsOptional() @IsNumber() @Min(5) @Max(24)
  bodySize?: number;

  @IsOptional() @IsNumber() @Min(5) @Max(24)
  labelSize?: number;

  @IsOptional() @IsNumber() @Min(5) @Max(24)
  tableHeaderSize?: number;

  @IsOptional() @IsNumber() @Min(5) @Max(24)
  tableBodySize?: number;
}

export class PdfMarginsDto {
  @IsOptional() @IsNumber() @Min(10) @Max(150)
  top?: number;

  @IsOptional() @IsNumber() @Min(10) @Max(150)
  bottom?: number;

  @IsOptional() @IsNumber() @Min(10) @Max(150)
  left?: number;

  @IsOptional() @IsNumber() @Min(10) @Max(150)
  right?: number;
}

export class PdfHeaderDto {
  @IsOptional() @IsBoolean()
  showLogo?: boolean;

  @IsOptional() @IsNumber() @Min(10) @Max(200)
  logoMaxHeight?: number;

  @IsOptional() @IsNumber() @Min(30) @Max(300)
  logoMaxWidth?: number;

  @IsOptional() @IsString() @MaxLength(500)
  titleText?: string;

  @IsOptional() @IsString() @MaxLength(500)
  subtitleText?: string;

  @IsOptional() @IsBoolean()
  showReference?: boolean;

  @IsOptional() @IsBoolean()
  showDates?: boolean;
}

export class PdfInfoBoxesDto {
  @IsOptional() @IsBoolean()
  showCollaborateur?: boolean;

  @IsOptional() @IsBoolean()
  showEntite?: boolean;

  @IsOptional() @IsString() @MaxLength(100)
  collaborateurTitle?: string;

  @IsOptional() @IsString() @MaxLength(100)
  entiteTitle?: string;
}

export class PdfTableDto {
  @IsOptional() @IsString() @MaxLength(200)
  sectionTitle?: string;

  @IsOptional() @IsBoolean()
  showRowNumbers?: boolean;

  @IsOptional() @IsString() @MaxLength(200)
  emptyMessage?: string;
}

export class PdfSignaturesDto {
  @IsOptional() @IsBoolean()
  showSignatures?: boolean;

  @IsOptional() @IsString() @MaxLength(200)
  itTitle?: string;

  @IsOptional() @IsString() @MaxLength(500)
  itMention?: string;

  @IsOptional() @IsString() @MaxLength(200)
  collabTitle?: string;

  @IsOptional() @IsString() @MaxLength(500)
  collabMention?: string;
}

export class PdfFooterDto {
  @IsOptional() @IsBoolean()
  showFooter?: boolean;

  @IsOptional() @IsString() @MaxLength(500)
  footerText?: string;
}

export class UpdatePdfTemplateDto {
  @IsOptional() @ValidateNested() @Type(() => PdfColorSchemeDto)
  colors?: PdfColorSchemeDto;

  @IsOptional() @ValidateNested() @Type(() => PdfFontsDto)
  fonts?: PdfFontsDto;

  @IsOptional() @ValidateNested() @Type(() => PdfMarginsDto)
  margins?: PdfMarginsDto;

  @IsOptional() @ValidateNested() @Type(() => PdfHeaderDto)
  header?: PdfHeaderDto;

  @IsOptional() @ValidateNested() @Type(() => PdfInfoBoxesDto)
  infoBoxes?: PdfInfoBoxesDto;

  @IsOptional() @ValidateNested() @Type(() => PdfTableDto)
  table?: PdfTableDto;

  @IsOptional() @ValidateNested() @Type(() => PdfSignaturesDto)
  signatures?: PdfSignaturesDto;

  @IsOptional() @ValidateNested() @Type(() => PdfFooterDto)
  footer?: PdfFooterDto;
}
