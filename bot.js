const colors = require('colors');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const readline = require('readline');
const fetch = require('node-fetch'); // Pastikan Anda sudah menginstal modul ini

dayjs.extend(utc);
dayjs.extend(timezone);

const CONSTANT = {
  TIME_REPEAT_AGAIN: 24 * 60 * 60, // 24 jam menjalankan sekali
  PROJECT_REPEAT: ['cats-small', 'goats', 'bool', 'ducks', 'duck-chain'], // Proyek yang dijalankan setiap hari
};

const profile = new Map();
const currentAccount = new Map();
const currentProject = new Map();
const KEY_CURRENT_PROFILE = 'currentProfile';
const KEY_CURRENT_PROJECT = 'currentProject';
const FORMAT_DATE_TIME = 'DD/MM/YYYY HH:mm';

const headers = {
  authority: '',
  'Content-Type': 'application/json',
  Origin: '',
  scheme: 'https',
  Priority: 'u=1, i',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': 'Windows',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
};

async function errors(message) {
  const { username } = await getCurrentProfile();
  const project = await getCurrentProject();
  console.log(
    colors.red(
      `[ ${project.toUpperCase()}${username ? ' - ' + username : ''} ]`,
    ),
    colors.red(message),
  );
}

async function logs(message) {
  const { username } = await getCurrentProfile();
  const project = await getCurrentProject();
  console.log(
    colors.cyan(
      `[ ${project.toUpperCase()}${username ? ' - ' + username : ''} ]`,
    ),
    colors.green(message),
  );
}

const formatNumber = (point = 0) => {
  return new Intl.NumberFormat('us-US').format(point);
};

async function setCurrentProfile(data) {
  currentAccount.set(KEY_CURRENT_PROFILE, data);
}

async function getCurrentProfile() {
  return currentAccount.get(KEY_CURRENT_PROFILE);
}

async function setCurrentProject(data) {
  currentProject.set(KEY_CURRENT_PROJECT, data);
}

async function getCurrentProject() {
  return currentProject.get(KEY_CURRENT_PROJECT);
}

async function getProfile() {
  return profile;
}

async function getHeader({
  isQueryId = false,
  url,
  method,
  customHeader,
  tokenType,
  typeQueryId = 'tma ',
}) {
  const splitUrl = url.split('/');
  const domain = [...splitUrl].slice(0, 3).join('/');
  const path = '/' + [...splitUrl].slice(3, splitUrl.length).join('/');

  const authDomain = {
    Origin: domain,
    authority: domain,
    path: path,
    method: method,
  };
  const { query_id, token } = await getCurrentProfile();
  if (isQueryId) {
    return {
      ...headers,
      ...authDomain,
      ...(typeQueryId === 'raw'
        ? { rawdata: query_id }
        : {
            Authorization: typeQueryId + query_id,
          }),

      ...customHeader,
    };
  }
  return {
    ...headers,
    ...authDomain,
    Authorization:
      tokenType === 'Bearer' ? 'Bearer ' + token : tokenType + token,
    ...customHeader,
  };
}

async function callApi({
  url,
  method,
  body = {},
  isQueryId = false,
  headersCustom = {},
  isAuth = true,
  typeQueryId,
  tokenType = 'Bearer',
}) {
  try {
    const genHeaders = await getHeader({
      isQueryId,
      url,
      method,
      headersCustom,
      tokenType,
      typeQueryId,
    });

    if (!isAuth) {
      delete genHeaders.Authorization;
      delete genHeaders.rawdata;
    }

    if (isQueryId) {
      typeQueryId === 'raw'
        ? delete genHeaders.Authorization
        : delete genHeaders.rawdata;
    }
    const res = await fetch(url, {
      method: method,
      headers: genHeaders,
      ...(method !== 'GET' && { body: JSON.stringify(body) }),
    });
    const response = await res.json();

    if (
      !response ||
      (response?.statusCode &&
        (response?.statusCode === 500 || response?.statusCode === 401))
    ) {
      errors(
        'Lấy lại query_id hoặc token !:' + url + `[ ${response?.message} ]`,
      );
      return response;
    }
    return response;
  } catch (error) {
    errors(`Error: ${error.message}`);
  }
}

function extractUserData(queryId) {
  const isUseDecode = queryId.startsWith('user=');
  const decodedString = decodeURIComponent(queryId);
  const params = new URLSearchParams(decodedString);
  const user = JSON.parse(params.get('user'));
  const query_id_decode = params.get('query_id');
  const auth_date = params.get('auth_date');
  const chat_instance = params.get('chat_instance');
  const start_param = params.get('start_param');
  const hash = params.get('hash');
  const chat_type = params.get('chat_type');

  return {
    userId: user.id,
    username: user.username,
    user: user,
    query_id: isUseDecode ? queryId : decodedString,
    token: '',
    auth_date: auth_date,
    chat_instance: chat_instance,
    start_param: start_param,
    hash: hash,
    chat_type: chat_type,
    query_id_decode: query_id_decode,
    isUseDecode: isUseDecode,
  };
}

async function loadConfig(nameFile) {
  return new Promise((res, rej) => {
    const parentDir = path.join(__dirname, '..');
    fs.readFile(
      path.resolve(parentDir, nameFile),
      'utf-8',
      async (err, data) => {
        if (err) {
          rej(err);
        }

        const d = JSON.parse(data);
        for (const item in d) {
          const convertQueryId = d[item]?.map((e) => {
            const hasQueryId = Object.keys(e).includes('query_id');
            if (hasQueryId) {
              return extractUserData(e['query_id']);
            }
            return e;
          });
          profile.set(item, convertQueryId);
        }

        await delay(2);
        res(d);
      },
    );
  });
}

function loadProfileTxt(pathFile) {
  try {
    const dataFile = path.join(pathFile, 'data.txt');
    const v = fs
      .readFileSync(dataFile, 'utf8')
      .replace(/\r/g, '')
      .split('\n')
      .filter(Boolean);

    const dataExtract = [];
    if (v.length) {
      for (let a of v) {
        const data = extractUserData(a);
        dataExtract.push(data);
      }
      console.log(
        colors.green(`Berhasil memuat ${colors.yellow(v.length)} profil!`),
      );
    } else
      console.log(colors.red('Tidak ada informasi di data.txt'));
    return dataExtract;
  } catch (e) {
    console.log(colors.red('Gagal memuat profil: ', e));
  }
}

async function delay(second, show) {
  for (let i = second; i >= 0; i--) {
    if (show) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(
        `${colors.dim('[ MENUNGGU ]')} Tunggu ${colors.cyan(
          i + 's',
        )} untuk melanjutkan siklus!`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function profileSummary() {
  profile.forEach((v, k) => {
    let key = k;

    console.log(`[ ${key} ]`.cyan, colors.green(v.length), 'profil');
  });
}

function randomBetweenNumber(min = 0, max) {
  if (!max) return 5;
  return Math.floor(Math.random() * (max - min + 1) + min);
}

async function login() {
  try {
    const url = 'https://uat-api.sunkong.cloud/v1/login';
    const account = await getCurrentProfile();
    const res = await callApi({
      url: url,
      method: 'POST',
      body: {
        init_data: account?.query_id,
      },
    });

    if (!res) {
      errors('Login gagal, peroleh query_id kembali!');
      return;
    }

    const {
      token: { access_token },
      point,
    } = res;

    const addToken = {
      ...account,
      token: access_token,
    };
    await setCurrentProfile(addToken);

    logs(`Saldo: ${colors.yellow(formatNumber(point))} 💰`);
    return access_token;
  } catch (error) {
    errors('Login gagal, peroleh query_id kembali!');
  }
}

async function doQuest() {
  const url = 'https://uat-api.sunkong.cloud/v1/missions';
  const res = await callApi({
    url: url,
    method: 'GET',
  });

  if (!res) {
    errors('Gagal memperoleh daftar misi!');
    return;
  }

  const tasks = [...res];

  const excludeTask = ['INVITE'];

  const listQuestUnFinish = tasks.filter(
    (e) => !e.is_done && !excludeTask.includes(e?.type),
  );

  if (listQuestUnFinish.length) {
    logs(`Mulai mengerjakan ${colors.cyan(listQuestUnFinish.length)} quest...`);
  } else {
    logs('Semua quest sudah selesai');
    return;
  }

  const { username } = await getCurrentProfile();

  for await (const task of listQuestUnFinish) {
    const { id, title } = task;
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(
      `[ ${colors.magenta(`${username}`)} ]` +
        colors.yellow(` Quest : ${colors.white(title)} `) +
        colors.red('Sedang mengerjakan... '),
    );
    const isChecked = await checkTask(id);
    if (!isChecked) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(
        `[ ${colors.magenta(`${username}`)} ]` +
          colors.yellow(` Quest : ${colors.white(title)} `) +
          colors.red('Mulai quest gagal!            '),
      );
      console.log();
      continue;
    }

    await delay(2);

    const isFinish = await finishQuest(id);
    readline.cursorTo(process.stdout, 0);
    if (isFinish) {
      process.stdout.write(
        `[ ${colors.magenta(`${username}`)} ]` +
          colors.yellow(` Quest : ${colors.white(title)} `) +
          colors.green('Selesai!                  '),
      );
    } else {
      process.stdout.write(
        `[ ${colors.magenta(`${username}`)} ]` +
          colors.yellow(` Quest : ${colors.white(title)} `) +
          colors.red('Gagal!                  '),
      );
    }
    console.log();
  }
  logs('Semua quest sudah selesai!');
  return true;
}

async function finishQuest(id) {
  try {
    const url = `https://uat-api.sunkong.cloud/v1/missions/claim/${id}`;
    const res = await callApi({
      url: url,
      method: 'POST',
    });
    return res;
  } catch (error) {
    errors('Gagal menyelesaikan quest: ' + error.message);
  }
}

async function checkTask(id) {
  try {
    const url = `https://uat-api.sunkong.cloud/v1/missions/complete/${id}`;
    const res = await callApi({
      url: url,
      method: 'POST',
    });
    return res;
  } catch (error) {
    errors('Gagal memeriksa task: ' + error.message);
  }
}

async function checkFriendClaim() {
  try {
    const url = `https://uat-api.sunkong.cloud/v1/referral`;
    const res = await callApi({
      url: url,
      method: 'GET',
    });
    if (!res) {
      errors('Tidak dapat memperoleh daftar teman!');
      return;
    }

    if (res?.claimable) {
      logs(`Terdapat ${res?.claimable} poin belum diklaim dari teman!`);
      return res?.claimable;
    }
  } catch (error) {
    errors('Gagal memeriksa klaim teman: ' + error.message);
  }
}

async function claimFriend() {
  try {
    const url = `https://uat-api.sunkong.cloud/v1/referral/withdraw`;
    const res = await callApi({
      url: url,
      method: 'POST',
    });
    if (!res) {
      errors('Gagal klaim poin dari teman!');
      return;
    }

    if (res?.point) {
      logs(
        `Klaim berhasil, saldo: ${colors.yellow(
          formatNumber(res?.point),
        )} `,
      );
    } else {
      errors('Gagal klaim poin dari teman!');
    }
  } catch (error) {
    errors('Gagal klaim poin dari teman: ' + error.message);
  }
}

async function startSession() {
  let runTheFirst = true;

  for await (const project of profile.keys()) {
    console.log('');
    const isRunningAllow = CONSTANT.PROJECT_REPEAT.includes(project);
    if (!runTheFirst && !isRunningAllow) {
      errors(
        `Proyek ${colors.cyan(project)} dihentikan setelah menjalankan pertama kali!`,
      );
      continue;
    }

    await setCurrentProject(project);

    const listAccount = profile.get(project);

    if (!listAccount.length) return;

    for await (const account of listAccount) {
      await setCurrentProfile(account);
      if (project === 'sunkong') {
        await login(); // Login saat memproses akun
        await doQuest();
        await checkFriendClaim();
      }
      console.log('');
      console.log(
        '-------------------------------[ 💤💤💤 ]-------------------------------',
      );
      console.log('');
      await delay(2);
    }
  }
  runTheFirst = false;
  await delay(CONSTANT.TIME_REPEAT_AGAIN, true);
  console.log('');
  await startSession();
}

(async function main() {
  console.log();
  await loadConfig('data.json');
  profileSummary();
  await startSession();
})();
