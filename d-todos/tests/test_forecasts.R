args <- grep("^--file=", commandArgs(), value = TRUE)
root <- dirname(dirname(normalizePath(sub("^--file=", "", args[1]))))
source(file.path(root, "cutoff_helpers.R"))
data <- read_cutoffs(file.path(root, "data.csv"))
validate_cutoffs(data)
forecasts <- forecast_cutoffs(data)
stopifnot(nrow(forecasts) == 42, all(forecasts$Year == 2027),
          all(forecasts$PredictionLow <= forecasts$ConfidenceLow),
          all(forecasts$ConfidenceLow <= forecasts$Estimate),
          all(forecasts$Estimate <= forecasts$ConfidenceHigh),
          all(forecasts$ConfidenceHigh <= forecasts$PredictionHigh))
# Independent closed-form regression checks, without calling lm/predict again.
for (i in seq_len(nrow(forecasts))) {
  f <- forecasts[i, ]
  rows <- data[data$Subject == f$Subject & data$Grade == f$Grade & data$Series == f$Series, ]
  x <- rows$Year; y <- rows$Percentage; n <- length(y)
  sxx <- sum((x - mean(x))^2)
  slope <- sum((x - mean(x)) * (y - mean(y))) / sxx
  fitted <- mean(y) + slope * (x - mean(x))
  estimate <- mean(y) + slope * (2027 - mean(x))
  sigma <- sqrt(sum((y - fitted)^2) / (n - 2))
  h <- 1 / n + (2027 - mean(x))^2 / sxx
  critical <- qt(0.975, n - 2)
  expected <- c(estimate, estimate - critical * sigma * sqrt(h), estimate + critical * sigma * sqrt(h),
                estimate - critical * sigma * sqrt(1 + h), estimate + critical * sigma * sqrt(1 + h))
  actual <- unlist(f[c("Estimate", "ConfidenceLow", "ConfidenceHigh", "PredictionLow", "PredictionHigh")])
  stopifnot(max(abs(actual - expected)) < 1e-8)
  stopifnot(abs(f$MeanStandardError - sigma * sqrt(h)) < 1e-8,
            abs(f$PredictionStandardError - sigma * sqrt(1 + h)) < 1e-8,
            abs(f$ResidualSD - sigma) < 1e-8,
            f$DegreesFreedom == n - 2, abs(f$CriticalValue - critical) < 1e-12)
}
recent <- forecast_cutoffs(data, since = 2018, level = 0.90)
stopifnot(all(recent$TrainingFrom == 2018), all(recent$Observations == 9), all(recent$ConfidenceLevel == 0.90))
invalid <- function(...) inherits(suppressWarnings(tryCatch(forecast_cutoffs(...), error = identity)), "error")
stopifnot(invalid(data, year = 2026), invalid(data, level = 1), invalid(data, since = 2026))
# Paper fits stay distinct from overall fits and do not require invented weightings.
papers <- data[data$Subject == "English", ]
papers$Series <- "Paper 1"; papers$Percentage <- papers$Percentage + 5; papers$Weighting <- 20
both <- forecast_cutoffs(rbind(data, papers))
paper_fit <- both[both$Series == "Paper 1", ]
overall_fit <- both[both$Subject == "English" & both$Series == "Overall", ]
stopifnot(all(abs(paper_fit$Estimate - overall_fit$Estimate - 5) < 1e-8))
stopifnot(inherits(make_cutoff_plot(data, "English"), "ggplot"))
cat("PASS: all 42 closed-form estimates and intervals, recent-year fits, paper forecasts, and invalid options.\n")
