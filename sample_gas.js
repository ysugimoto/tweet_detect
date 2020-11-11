// Ref: https://qiita.com/nobu09/items/c940fc6e0d67ef1cbc85
const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/******/***********/**********';

// Twitter related configurations
const TWITTER_API_KEY = '';
const TWITTER_API_SECRET = '';
const TWITTER_OAUTH_ENDPOINT = 'https://api.twitter.com/oauth2/token';
const TWITTER_SEARCH_ENDPOINT = 'https://api.twitter.com/1.1/search/tweets.json';
const TWITTER_LINK_URL = 'https://twitter.com/i/web/status';

// sheet names
const SERVICE_SHEET_NAME = 'services';
const FILTER_WORDS_SHEET_NAME = 'filter_words';
const IGNORE_WORDS_SHEET_NAME = 'ignore_words';

// slack post items
const SLACK_POST_ITEMS = 10;

const makeIgnoreRegex = ignoreWords => {
  const words = ignoreWords.reduce((prev, next) => {
    const [word] = next;
    if (word === "" || word === undefined) {
      return prev;
    }
    prev.push(`.*${word}.*`);
    return prev;
  }, []);

  const wordString = words.join('|');
  return wordString !== '' ? new RegExp(wordString) : null;
};

// Fertch Twitter access bearer token from oauth
const fetchAccessToken = () => {
  const blob = Utilities.newBlob(`${TWITTER_API_KEY}:${TWITTER_API_SECRET}`);
  const credential = Utilities.base64Encode(blog.getBytes());

  const authRequestOptions = {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
    headers: {
      Authorization: `Basic ${credential}`
    },
    payload: {
      grant_type: 'client_credentials'
    }
  };
  const authResponse = UrlFetchApp.fetch(TWITTER_OAUTH_ENDPOINT, authRequestOptions);
  const { access_token } = JSON.parse(authResponse);

  return access_token;
}

// Search twitter
const searchTwitter = ({
  serviceName,
  filterWord,
  ignores,
  range,
  accessToken
}) => {
  if (serviceName === '' || filterWord === '') {
    return [];
  }
  const searchRequestOptions = {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  };
  const query = encodeURIComponent(`${serviceName} ${filterWord} -RT lang:ja`);
  const searchResponse = UrlFetchApp.fetch(
    `${TWITTER_SEARCH_ENDPOINT}?q=${query}&lang=ja&result_type=recent&count=100`,
    searchRequestOptions
  );
  const { statuses } = JSON.parse(searchResponse);

  return statuses.reduce((prev, next) => {
    const {
      text,
      id,
      created_at,
      user: {
        name
      }
    } = next;

    const tweetDate = new Date(created_at);
    const serviceNameRegex = new RegExp(`.*${serviceName}.*`, 'i');
    const filterWordRegex = new RegExp(`.*${filterWord}.*`, 'i');

    // Check condition is matched
    // If ignore words are included in tweet, skip it
    if (ignores && ignores.test(text.toLowerCase())) {
      return prev;
    }
    // If service name and filter word are included, and also tweet time is in range, add to stack
    if (range < tweetDate && serviceNameRegex.test(text.toLowerCase()) && filterWordRegex.test(text.toLowerCase())) {
      const jst = Utilities.formatDate(tweetDate, "JST", "yyyy/MM/dd HH:MM");
      prev.push(`*${name}(${jst})*\n\`\`\`${text}\`\`\`\n${TWITTER_LINK_URL}/${id}`);
    }
    return prev;
  }, []);
};

// Slack notification
const postToSlack = text => {
  UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text })
  });
};

// Bootstrap function
const main = () => {
  const now = new Date();
  const checkRange = now.setMinutes(now.getMinutes() - 15);

  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const services = sheet.getSheetByName(SERVICE_SHEET_NAME).getDataRange().getValues();
  const filterWords = sheet.getSheetByName(FILTER_WORDS_SHEET_NAME).getDataRange().getValues();
  const ignoreWords = sheet.getSheetByName(IGNORE_WORDS_SHEET_NAME).getDataRange().getValues();
  const ignoreRegex = makeIgnoreRegex(ignoreWords);

  // Firstly, fetch Twitter access token
  const accessToken = fetchAccessToken();

  // Skip first row and search on Twitter
  services.slice(1).forEach(service => {
    const results = [];
    const [serviceName, threshold] = service;

    filterWords.forEach(filterWord => {
      const response = searchTwitter({
        serviceName: serviceName || '',
        filterWord: filterWord[0] || '',
        ignores: ignoreRegex,
        range: checkRange,
        accessToken
      });
      response.forEach(resp => result.push(resp));
      Utilities.sleep(100);
    });

    if (results.length < threshold) {
      return;
    }
    postToSlack(
      `「${serviceName}」について${results.length}件のTweetが見つかりました。サービスが落ちているかもしれません。直近${SLACK_POST_ITEMS}件のTweetを通知します。`
    );
    results
      .slice(0, SLACK_POST_ITEMS)
      .forEach(item => postToSlack(item));
  });
};
