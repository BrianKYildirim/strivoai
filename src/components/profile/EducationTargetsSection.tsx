import { useEffect, useRef, useState } from "react";
import { GraduationCap, Plus, Target, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface EducationTargetsValue {
  school: string;
  major: string;
  year: string;
  graduation_year: number | null;
  location_preference: string;
  target_industries: string[];
  target_roles: string[];
  target_companies: string[];
  career_goals: string;
}

interface EducationTargetsSectionProps {
  value: EducationTargetsValue;
  onChange: (value: EducationTargetsValue) => void;
}

const YEAR_OPTIONS = ["freshman", "sophomore", "junior", "senior", "graduate", "other"];
const GRADUATION_YEARS = Array.from({ length: 9 }, (_, index) => 2024 + index);

function addChip(items: string[], value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed || items.includes(trimmed)) return items;
  return [...items, trimmed];
}

function removeChip(items: string[], value: string): string[] {
  return items.filter((item) => item !== value);
}

export default function EducationTargetsSection({
  value,
  onChange,
}: EducationTargetsSectionProps) {
  const schoolInputRef = useRef<HTMLInputElement>(null);
  const [newIndustry, setNewIndustry] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newCompany, setNewCompany] = useState("");

  useEffect(() => {
    if (window.location.hash !== "#education-targets") return;
    const element = document.getElementById("education-targets");
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => schoolInputRef.current?.focus(), 250);
  }, []);

  const update = <K extends keyof EducationTargetsValue>(
    key: K,
    nextValue: EducationTargetsValue[K],
  ) => {
    onChange({ ...value, [key]: nextValue });
  };

  const renderChips = (
    items: string[],
    onRemove: (item: string) => void,
  ) => (
    items.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item} variant="secondary" className="text-sm px-3 py-1.5 flex items-center gap-2">
            {item}
            <X
              className="h-3 w-3 cursor-pointer hover:text-red-500"
              onClick={() => onRemove(item)}
            />
          </Badge>
        ))}
      </div>
    ) : null
  );

  return (
    <div id="education-targets" className="scroll-mt-24">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-2">
          <GraduationCap className="h-6 w-6" style={{ color: "#FF5F67" }} />
          <h2 className="text-2xl font-bold">Education & Targets</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Benchmark your profile against peers with similar education and career goals.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div>
            <Label htmlFor="school" className="text-base font-semibold mb-2 block">
              School
            </Label>
            <Input
              ref={schoolInputRef}
              id="school"
              value={value.school}
              onChange={(event) => update("school", event.target.value)}
              placeholder="University or program"
              className="h-12"
            />
          </div>

          <div>
            <Label htmlFor="major" className="text-base font-semibold mb-2 block">
              Major
            </Label>
            <Input
              id="major"
              value={value.major}
              onChange={(event) => update("major", event.target.value)}
              placeholder="Finance, Computer Science, Economics"
              className="h-12"
            />
          </div>

          <div>
            <Label htmlFor="year" className="text-base font-semibold mb-2 block">
              Year
            </Label>
            <Select value={value.year} onValueChange={(nextValue) => update("year", nextValue)}>
              <SelectTrigger id="year" className="h-12">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="graduation_year" className="text-base font-semibold mb-2 block">
              Graduation Year
            </Label>
            <Select
              value={value.graduation_year ? String(value.graduation_year) : ""}
              onValueChange={(nextValue) => update("graduation_year", Number(nextValue))}
            >
              <SelectTrigger id="graduation_year" className="h-12">
                <SelectValue placeholder="Select graduation year" />
              </SelectTrigger>
              <SelectContent>
                {GRADUATION_YEARS.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="location_preference" className="text-base font-semibold mb-2 block">
              Target Location
            </Label>
            <Input
              id="location_preference"
              value={value.location_preference}
              onChange={(event) => update("location_preference", event.target.value)}
              placeholder="New York, Remote, London"
              className="h-12"
            />
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Target className="h-5 w-5" style={{ color: "#FF5F67" }} />
              <h3 className="text-lg font-semibold">Target Industries</h3>
            </div>
            <div className="flex gap-2 mb-3">
              <Input
                value={newIndustry}
                onChange={(event) => setNewIndustry(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    update("target_industries", addChip(value.target_industries, newIndustry));
                    setNewIndustry("");
                  }
                }}
                placeholder="Fintech, Consulting, Healthcare"
                className="h-12"
              />
              <Button
                type="button"
                onClick={() => {
                  update("target_industries", addChip(value.target_industries, newIndustry));
                  setNewIndustry("");
                }}
                style={{ backgroundColor: "#FF5F67" }}
                className="h-12 px-6"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {renderChips(value.target_industries, (item) =>
              update("target_industries", removeChip(value.target_industries, item)),
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Target Roles</h3>
            <div className="flex gap-2 mb-3">
              <Input
                value={newRole}
                onChange={(event) => setNewRole(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    update("target_roles", addChip(value.target_roles, newRole));
                    setNewRole("");
                  }
                }}
                placeholder="Financial Analyst, Product Manager, Software Engineer"
                className="h-12"
              />
              <Button
                type="button"
                onClick={() => {
                  update("target_roles", addChip(value.target_roles, newRole));
                  setNewRole("");
                }}
                style={{ backgroundColor: "#FF5F67" }}
                className="h-12 px-6"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {renderChips(value.target_roles, (item) =>
              update("target_roles", removeChip(value.target_roles, item)),
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Target Companies</h3>
            <div className="flex gap-2 mb-3">
              <Input
                value={newCompany}
                onChange={(event) => setNewCompany(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    update("target_companies", addChip(value.target_companies, newCompany));
                    setNewCompany("");
                  }
                }}
                placeholder="Goldman Sachs, Google, McKinsey"
                className="h-12"
              />
              <Button
                type="button"
                onClick={() => {
                  update("target_companies", addChip(value.target_companies, newCompany));
                  setNewCompany("");
                }}
                style={{ backgroundColor: "#FF5F67" }}
                className="h-12 px-6"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {renderChips(value.target_companies, (item) =>
              update("target_companies", removeChip(value.target_companies, item)),
            )}
          </div>

          <div>
            <Label htmlFor="career_goals" className="text-base font-semibold mb-2 block">
              Career Goals
            </Label>
            <Textarea
              id="career_goals"
              value={value.career_goals}
              maxLength={500}
              onChange={(event) => update("career_goals", event.target.value)}
              placeholder="What are you trying to achieve next?"
              className="min-h-28"
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {value.career_goals.length}/500
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export { GRADUATION_YEARS, YEAR_OPTIONS };
