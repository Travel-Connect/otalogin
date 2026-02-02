import type { ChannelCode } from '../types/channel';

export const CHANNEL_CONFIGS: Record<
  ChannelCode,
  {
    name: string;
    login_url: string;
    selectors: {
      username: string;
      password: string;
      submit: string;
      success_indicator: string;
    };
    extra_fields?: {
      key: string;
      label: string;
      selector: string;
    }[];
  }
> = {
  rakuten: {
    name: '楽天トラベル',
    login_url: 'https://hotel.travel.rakuten.co.jp/extranet/login',
    selectors: {
      username: '#username',
      password: '#password',
      submit: '#login-button',
      success_indicator: '.dashboard-header',
    },
  },
  jalan: {
    name: 'じゃらん',
    login_url: 'https://www.jalan.net/jalan/doc/howto/innkanri/',
    selectors: {
      username: '#login_id',
      password: '#password',
      submit: 'button[type="submit"]',
      success_indicator: '.main-content',
    },
  },
  neppan: {
    name: 'ねっぱん',
    login_url: 'https://asp.hotel-story.ne.jp/ver3/ASPU0201.asp',
    selectors: {
      username: 'input[name="txtHotelID"]',
      password: 'input[name="txtPwd"]',
      submit: 'input[type="submit"]',
      success_indicator: '#main-menu',
    },
    extra_fields: [
      {
        key: 'hotel_id',
        label: '施設ID',
        selector: 'input[name="txtHotelCD"]',
      },
    ],
  },
};

export const CHANNEL_CODES: ChannelCode[] = ['rakuten', 'jalan', 'neppan'];
