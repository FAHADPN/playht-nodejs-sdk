import type { V1ApiOptions } from './apiCommon';
import axios from 'axios';
import { APISettingsStore } from './APISettingsStore';
import { PLAY_SDK_VERSION } from './internal/sdkVersion';

export type V1SpeechResult = {
  transcriptionId: string;
  audioUrl: string;
  message?: string;
};

type GenerationStatusResponse = {
  audioUrl: [string] | string;
  transcriped?: boolean;
  converted?: boolean;
  message?: string;
  error?: string;
};

type GenerationJobResponse = {
  status: string;
  transcriptionId: string;
  contentLength: number;
  wordCount: number;
};

const WAIT_BETWEEN_STATUS_CHECKS_MS = 300;
const MAX_STATUS_CHECKS_RETRIES = 20;

export async function generateV1Speech(
  content: string,
  voice: string,
  options?: V1ApiOptions,
): Promise<V1SpeechResult> {
  const { apiKey, userId } = APISettingsStore.getSettings();
  const convertOptions = {
    method: 'POST',
    url: 'https://api.play.ht/api/v1/convert',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: apiKey,
      'x-user-id': userId,
      'x-play-sdk-version': PLAY_SDK_VERSION,
    },
    data: {
      content: [content],
      voice,
      narrationStyle: options?.narrationStyle,
      globalSpeed: options?.globalSpeed,
      trimSilence: options?.trimSilence,
      pronunciations: options?.pronunciations,
    },
  };

  const generationJobData = await axios
    .request(convertOptions)
    .then(({ data }: { data: GenerationJobResponse }) => data)
    .catch((error: any) => {
      throw {
        message: error.response?.data?.error_message || error.message,
        code: error.code,
        statusCode: error.response?.statusCode,
        statusMessage: error.response?.statusMessage,
      };
    });

  const transcriptionId = generationJobData.transcriptionId;

  const statusOptions = {
    method: 'GET',
    url: `https://api.play.ht/api/v1/articleStatus?transcriptionId=${transcriptionId}`,
    headers: {
      accept: 'application/json',
      authorization: apiKey,
      'x-user-id': userId,
      'x-play-sdk-version': PLAY_SDK_VERSION,
    },
  };

  let retries = 0;
  return await (async function retryUntilGenerated() {
    do {
      const generationStatus = await axios
        .request(statusOptions)
        .then(({ data }: { data: GenerationStatusResponse }) => {
          return data;
        })
        .catch(function (error) {
          throw {
            message: error.response?.data?.error_message || error.message,
            code: error.code,
            statusCode: error.response?.statusCode,
            statusMessage: error.response?.statusMessage,
          };
        });
      const { audioUrl, message, transcriped, converted, error } = generationStatus;
      if (error) {
        throw {
          message: 'Audio generation error. Please wait a few moments and try again or contact support.',
          code: 'GENERATION_ERROR',
          timestamp: new Date().toISOString(),
        };
      }
      if (transcriped || converted) {
        const url = Array.isArray(audioUrl) ? audioUrl[0] : audioUrl;
        return {
          message,
          transcriptionId,
          audioUrl: url,
        };
      }
      retries++;
      await new Promise((resolve) => setTimeout(resolve, WAIT_BETWEEN_STATUS_CHECKS_MS));
    } while (retries < MAX_STATUS_CHECKS_RETRIES);
    throw {
      message: 'Audio generation error. Max status check retries reached.',
      code: 'MAX_STATUS_CHECK_RETRIES_REACHED',
      timestamp: new Date().toISOString(),
    };
  })();
}
