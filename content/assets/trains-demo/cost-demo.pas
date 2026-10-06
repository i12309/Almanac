program TrainCostDemo;
{$mode objfpc}{$H+}

{ New teaching model for the Almanac mockup. All inputs are synthetic.
  Costs are in million RUB; end-of-year payments; no residual value.
  This is a cost comparison, not investment profitability. }

const
  AnnualDistance = 250000.0;  { km/year }
  EnergyTariff = 8.0;        { RUB/kWh }
  DiscountRate = 0.05;
  Horizon = 20;

function AnnualCost(maintenance, energyPerKm: Double): Double;
begin
  AnnualCost := maintenance + AnnualDistance * energyPerKm * EnergyTariff / 1000000;
end;

function DiscountedCost(acquisition, maintenance, energyPerKm: Double;
                        years: Integer): Double;
var
  year: Integer;
  discountFactor, value, annual: Double;
begin
  annual := AnnualCost(maintenance, energyPerKm);
  value := acquisition;
  discountFactor := 1;
  for year := 1 to years do
  begin
    discountFactor := discountFactor * (1 + DiscountRate);
    value := value + annual / discountFactor;
  end;
  DiscountedCost := value;
end;

var
  costA, costB: Double;
begin
  costA := DiscountedCost(120.0, 4.2, 4.7, Horizon);
  costB := DiscountedCost(145.0, 3.4, 3.8, Horizon);
  Writeln('A, discounted million RUB: ', costA:0:6);
  Writeln('B, discounted million RUB: ', costB:0:6);
  Writeln('A minus B, million RUB:    ', (costA - costB):0:6);
end.
