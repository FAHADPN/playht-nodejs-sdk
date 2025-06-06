import type { VoiceInfo } from '..';
import axios from 'axios';
import { APISettingsStore } from './APISettingsStore';
import { PLAY_SDK_VERSION } from './internal/sdkVersion';

type V1APIVoiceInfo = {
  value: string;
  name: string;
  language: string;
  voiceType: string;
  languageCode: string;
  gender: 'Male' | 'Female';
  service: string;
  sample: string;
  isNew?: boolean;
  isKid?: boolean;
  styles?: Array<string>;
};

const CACHE_EXPIRE_TIME = 1000 * 60 * 60 * 12; // 12 hours

let _v1VoicesCache: Array<VoiceInfo>;
let _cacheUpdatedTime: number;

export async function availableV1Voices(): Promise<Array<VoiceInfo>> {
  const { apiKey, userId } = APISettingsStore.getSettings();
  const options = {
    method: 'GET',
    url: 'https://api.play.ht/api/v1/getVoices',
    headers: {
      accept: 'application/json',
      authorization: apiKey,
      'x-user-id': userId,
      'x-play-sdk-version': PLAY_SDK_VERSION,
    },
  };

  if (_v1VoicesCache && _cacheUpdatedTime && Date.now() - _cacheUpdatedTime < CACHE_EXPIRE_TIME) {
    return _v1VoicesCache;
  }

  _v1VoicesCache = await axios
    .request(options)
    .then(
      ({
        data,
      }: {
        data: {
          voices: Array<V1APIVoiceInfo>;
        };
      }): Array<VoiceInfo> =>
        data.voices.map((v1Voice) => ({
          voiceEngine: 'Standard' as const,
          id: v1Voice.value,
          name: v1Voice.name,
          sampleUrl: v1Voice.sample ? v1Voice.sample : undefined,
          language: v1Voice.language,
          languageCode: v1Voice.languageCode,
          // Use ternary operator to get correct type.
          gender:
            v1Voice.gender.toLocaleLowerCase() === 'male'
              ? 'male'
              : v1Voice.gender.toLocaleLowerCase() === 'female'
              ? 'female'
              : undefined,
          ageGroup: v1Voice.isKid === true ? 'youth' : 'adult',
          styles: v1Voice.styles,
          isCloned: false,
        })),
    )
    .catch(function (error) {
      throw {
        message: error.response?.data?.error_message || error.message,
        code: error.code,
        statusCode: error.response?.statusCode,
        statusMessage: error.response?.statusMessage,
      };
    });

  _cacheUpdatedTime = Date.now();
  return _v1VoicesCache;
}
