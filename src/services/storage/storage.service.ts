import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import storageConfig from '../../core/config/storage.config';
import { UploadedFile } from '../../common/interfaces/uploaded-file.interface';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly storageCfg: ConfigType<typeof storageConfig>,
  ) {
    this.bucket = this.storageCfg.bucket!;
    this.s3 = new S3Client({
      endpoint: this.storageCfg.endpoint,
      region: this.storageCfg.region ?? 'us-east-1',
      credentials: {
        accessKeyId: this.storageCfg.accessKey!,
        secretAccessKey: this.storageCfg.secretKey!,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  async upload(file: UploadedFile, key: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ContentLength: file.size,
      ServerSideEncryption: 'AES256', // C7 FIX: encryption at-rest
    });

    await this.s3.send(command);
    this.logger.log(`File uploaded: ${key}`);

    return key;
  }

  async getPresignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.s3, command, {
      expiresIn: expiresInSeconds,
    });

    return url;
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3.send(command);
    this.logger.log(`File deleted: ${key}`);
  }
}
