"""Little Algebra: Python starter / Python 入門
Run: python start_here.py
Install: python -m pip install numpy scipy matplotlib pandas
Graphs open in a separate window. / 圖表在獨立視窗開啟。
"""
import numpy as np
import pandas as pd
from scipy.stats import norm, binom
import matplotlib.pyplot as plt

# 1. Arrays, vectors, matrices / 陣列、向量、矩陣
v = np.array([3., 4.])
A = np.array([[1., 1.], [0., 1.]])
print('Vector length / 向量長度:', np.linalg.norm(v))
print('Av:', A @ v)  # @ is matrix multiplication; * is elementwise.
print('Solve / 解方程:', np.linalg.solve(A, np.array([5., 2.])))
print('Determinant / 行列式:', np.linalg.det(A))

# 2. A table of paired observations / 一張配對數據表
data = pd.DataFrame({'x': [1., 2., 3., 4., 5.], 'y': [2., 3., 5., 4., 7.]})
print(data)
print(data.describe())
x = data['x'].to_numpy()
y = data['y'].to_numpy()
X = np.column_stack([np.ones_like(x), x])
beta, *_ = np.linalg.lstsq(X, y, rcond=None)
fitted = X @ beta
print('Intercept, slope / 截距、斜率:', beta)
print('Residuals / 殘差:', y - fitted)
print('Sample SD / 樣本標準差:', y.std(ddof=1))

# 3. Distribution functions / 分布函式
print('P(-1 <= Z <= 1):', norm.cdf(1) - norm.cdf(-1))
print('P(Binomial(10, 0.3) = 3):', binom.pmf(3, 10, 0.3))

# 4. Repeated sampling / 重複抽樣
rng = np.random.default_rng(42)
sample_size = 40
means = rng.exponential(1, size=(500, sample_size)).mean(axis=1)
se = 1 / np.sqrt(sample_size)  # Population SD is known to be 1.
coverage = np.mean(np.abs(means - 1) <= 1.96 * se)
print('Approximate 95% interval coverage / 近似覆蓋率:', coverage)

# 5. Bootstrap: resample observed data / 自助法：從樣本再抽樣
bootstrap_means = rng.choice(y, size=(1000, len(y)), replace=True).mean(axis=1)
print('Bootstrap percentile interval / 自助百分位區間:',
      np.quantile(bootstrap_means, [0.025, 0.975]))

# 6. Four views / 四種視覺化
fig, axes = plt.subplots(2, 2, figsize=(10, 7))
axes[0, 0].scatter(x, y, color='#5282a0')
axes[0, 0].plot(x, fitted, color='#47724a')
axes[0, 0].vlines(x, y, fitted, color='#c77d9e', linestyles='dashed')
axes[0, 0].set(title='Least squares', xlabel='x', ylabel='y')
z = np.linspace(-4, 4, 400)
axes[0, 1].plot(z, norm.pdf(z), color='#47724a')
axes[0, 1].fill_between(z, norm.pdf(z), where=np.abs(z) <= 1,
                        alpha=0.3, color='#47724a')
axes[0, 1].set(title='Normal density: area is probability', xlabel='z', ylabel='Density')
axes[1, 0].hist(means, bins=25, color='#47724a', alpha=0.7)
axes[1, 0].axvline(1, color='#c77d9e')
axes[1, 0].set(title='Means of exponential samples (n=40)', xlabel='Sample mean', ylabel='Count')
axes[1, 1].hist(bootstrap_means, bins=20, color='#5282a0', alpha=0.7)
axes[1, 1].set(title='Bootstrap means of observed y', xlabel='Bootstrap mean', ylabel='Count')
fig.tight_layout()
plt.show()
