"""
3단계: 백테스트 엔진 - 이동평균 크로스오버 전략

일봉 데이터(data/daily/{TICKER}.csv)로 이동평균 크로스오버 전략을
과거 데이터에 시뮬레이션하고, 매수 후 보유(바이앤홀드)와 비교합니다.

전략 규칙:
- 단기 이동평균(SHORT_WINDOW일)이 장기 이동평균(LONG_WINDOW일)보다 위로 올라오면 보유(매수)
- 아래로 내려가면 청산(현금 보유, 매도)
- 신호가 발생한 "다음날" 종가로 진입/청산한다고 가정합니다 (오늘 종가를 보고
  오늘 바로 살 수는 없으니까요 - 이런 착각을 "선행 편향"이라고 부릅니다).

주의 (반드시 읽어주세요):
- 매매 수수료, 슬리피지(체결 오차), 세금은 전혀 반영하지 않은 단순화된 시뮬레이션입니다.
  실제로는 이 값들 때문에 수익률이 여기 나온 숫자보다 낮아집니다.
- 초기자본(INITIAL_CAPITAL)은 수익률 계산용 임의의 숫자일 뿐, 환율/통화 변환은 반영하지 않습니다.
- 과거 데이터로 잘 맞았다고 미래에도 잘 맞는다는 보장은 없습니다.
"""
import os

import pandas as pd

WATCHLIST = ["AAPL", "AMZN", "GOOGL", "TSLA", "NVDA", "META", "MSFT"]
SHORT_WINDOW = 20  # 단기 이동평균 기간(일)
LONG_WINDOW = 60  # 장기 이동평균 기간(일)
INITIAL_CAPITAL = 10_000_000  # 수익률 계산용 임의의 초기자본

RESULT_DIR = "backtest_results"


def load_daily(ticker: str) -> pd.DataFrame:
    path = f"data/daily/{ticker}.csv"
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]

    # to_csv()가 만든 의미 없는 순번 컬럼(Unnamed: 0 등)은 버립니다.
    df = df.drop(columns=[c for c in df.columns if c.startswith("unnamed")], errors="ignore")

    # 날짜/시간 컬럼을 찾아서 인덱스로 설정합니다.
    time_col = next((c for c in ("time", "date", "datetime") if c in df.columns), None)
    if time_col is None:
        raise ValueError(f"날짜 컬럼을 찾을 수 없습니다. 실제 컬럼: {list(df.columns)}")
    df[time_col] = pd.to_datetime(df[time_col])
    df = df.set_index(time_col)

    if "close" not in df.columns:
        raise ValueError(f"'close' 컬럼을 찾을 수 없습니다. 실제 컬럼: {list(df.columns)}")
    return df.sort_index()


def add_signals(df: pd.DataFrame, short_window=SHORT_WINDOW, long_window=LONG_WINDOW) -> pd.DataFrame:
    df = df.copy()
    df["ma_short"] = df["close"].rolling(short_window).mean()
    df["ma_long"] = df["close"].rolling(long_window).mean()
    df["position"] = (df["ma_short"] > df["ma_long"]).astype(int)
    df["position"] = df["position"].shift(1).fillna(0)  # 신호 다음날 진입/청산
    return df


def run_backtest(df: pd.DataFrame, initial_capital=INITIAL_CAPITAL) -> pd.DataFrame:
    df = df.copy()
    df["daily_return"] = df["close"].pct_change().fillna(0)
    df["strategy_return"] = df["daily_return"] * df["position"]
    df["equity"] = (1 + df["strategy_return"]).cumprod() * initial_capital
    df["buy_hold_equity"] = (1 + df["daily_return"]).cumprod() * initial_capital
    return df


def summarize(df: pd.DataFrame, ticker: str, initial_capital=INITIAL_CAPITAL) -> dict:
    years = max((df.index[-1] - df.index[0]).days / 365.25, 0.01)

    final_equity = df["equity"].iloc[-1]
    total_return = final_equity / initial_capital - 1
    cagr = (final_equity / initial_capital) ** (1 / years) - 1

    drawdown = df["equity"] / df["equity"].cummax() - 1
    max_drawdown = drawdown.min()

    bh_final = df["buy_hold_equity"].iloc[-1]
    bh_return = bh_final / initial_capital - 1

    num_trades = int((df["position"].diff() == 1).sum())

    return {
        "종목": ticker,
        "전략 총수익률": f"{total_return:.1%}",
        "전략 CAGR": f"{cagr:.1%}",
        "최대낙폭(MDD)": f"{max_drawdown:.1%}",
        "매매 횟수": num_trades,
        "바이앤홀드 총수익률": f"{bh_return:.1%}",
    }


def main():
    os.makedirs(RESULT_DIR, exist_ok=True)
    summaries = []

    for ticker in WATCHLIST:
        try:
            df = load_daily(ticker)
        except FileNotFoundError:
            print(f"[{ticker}] data/daily/{ticker}.csv 없음 — collect_data.py 먼저 실행하세요")
            continue

        df = add_signals(df)
        df = run_backtest(df)
        df.to_csv(f"{RESULT_DIR}/{ticker}_equity_curve.csv")

        summaries.append(summarize(df, ticker))
        print(f"[{ticker}] 백테스트 완료")

    if summaries:
        result_df = pd.DataFrame(summaries)
        print(f"\n=== 결과 요약 (단기 {SHORT_WINDOW}일 / 장기 {LONG_WINDOW}일 이동평균) ===")
        print(result_df.to_string(index=False))
        result_df.to_csv(f"{RESULT_DIR}/summary.csv", index=False, encoding="utf-8-sig")
        print(f"\n요약 저장: {RESULT_DIR}/summary.csv")


if __name__ == "__main__":
    main()
