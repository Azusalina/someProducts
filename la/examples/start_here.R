# Little Algebra: R starter / R 入門
# Run in R or RStudio; no extra packages required. / 不需要額外套件。

# 1. Vectors, matrices / 向量、矩陣
v <- c(3, 4)
A <- matrix(c(1, 1, 0, 1), nrow=2, byrow=TRUE)
print(sqrt(sum(v^2)))       # 5
print(A %*% v)             # 7, 4
print(solve(A, c(5, 2)))    # 3, 2
print(det(A))              # 1
# %*% is matrix multiplication; * is elementwise. / %*% 是矩陣乘法。

# 2. Tables and regression / 表格與回歸
data <- data.frame(x=c(1, 2, 3, 4, 5), y=c(2, 3, 5, 4, 7))
print(data)
print(summary(data))
fit <- lm(y ~ x, data=data)
print(coef(fit))
print(residuals(fit))
print(sd(data$y))          # sample SD: denominator n-1 / 樣本標準差

# 3. Probability / 機率
print(pnorm(1) - pnorm(-1))
print(dbinom(3, size=10, prob=0.3))

# 4. Sampling distribution / 抽樣分布
set.seed(42)
n <- 40
means <- replicate(500, mean(rexp(n, rate=1)))
se <- 1/sqrt(n)            # known population SD = 1 / 已知總體標準差
print(mean(abs(means - 1) <= 1.96*se))

# 5. Bootstrap / 自助法
boot_means <- replicate(1000, mean(sample(data$y, nrow(data), replace=TRUE)))
print(quantile(boot_means, c(0.025, 0.975)))

# 6. Four plots / 四種圖表
old_par <- par(mfrow=c(2, 2))
plot(data$x, data$y, pch=19, col="#5282a0", xlab="x", ylab="y", main="Least squares")
abline(fit, col="#47724a", lwd=2)
segments(data$x, data$y, data$x, fitted(fit), col="#c77d9e", lty=2)
curve(dnorm(x), from=-4, to=4, col="#47724a", lwd=2,
      xlab="z", ylab="Density", main="Normal density")
hist(means, breaks=25, col="#47724a", main="Sample means (n=40)", xlab="Sample mean")
abline(v=1, col="#c77d9e", lwd=2)
hist(boot_means, breaks=20, col="#5282a0", main="Bootstrap means", xlab="Bootstrap mean")
par(old_par)
