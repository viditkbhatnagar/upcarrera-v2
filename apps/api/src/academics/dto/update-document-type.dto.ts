import { PartialType } from '@nestjs/mapped-types';
import { CreateDocumentTypeDto } from './create-document-type.dto';

/** Every field optional on edit — mirrors the legacy free-form edit form. */
export class UpdateDocumentTypeDto extends PartialType(CreateDocumentTypeDto) {}
