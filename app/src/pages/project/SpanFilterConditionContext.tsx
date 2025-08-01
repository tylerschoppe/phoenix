import {
  createContext,
  PropsWithChildren,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { validateSpanFilter, isFilterExecutable } from "./spanFilterValidation";

export type SpanFilterConditionContextType = {
  // Input value - what the user is currently typing
  inputValue: string;
  setInputValue: (value: string) => void;
  
  // Applied filter - what gets sent to backend (only valid filters)
  filterCondition: string;
  
  // Legacy support for existing components
  setFilterCondition: (condition: string) => void;
  appendFilterCondition: (condition: string) => void;
  
  // Validation state
  isValidInput: boolean;
  validationError?: string;
};

export const SpanFilterConditionContext =
  createContext<SpanFilterConditionContextType | null>(null);

export function useSpanFilterCondition() {
  const context = useContext(SpanFilterConditionContext);
  if (context === null) {
    throw new Error(
      "useSpanFilterCondition must be used within a SpanFilterConditionProvider"
    );
  }
  return context;
}

const DEBOUNCE_DELAY = 500; // 500ms debounce

export function SpanFilterConditionProvider(props: PropsWithChildren) {
  const [inputValue, setInputValue] = useState<string>("");
  const [filterCondition, _setFilterCondition] = useState<string>("");
  const [isValidInput, setIsValidInput] = useState<boolean>(true);
  const [validationError, setValidationError] = useState<string>();

  // Debounced effect to validate input and update applied filter
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const validation = validateSpanFilter(inputValue);
      setIsValidInput(validation.isValid);
      setValidationError(validation.errorMessage);

      // Only update the applied filter if input is valid or empty
      if (validation.isValid && isFilterExecutable(inputValue)) {
        startTransition(() => {
          _setFilterCondition(inputValue);
        });
      }
      // If invalid, keep the previous valid filter condition
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(timeoutId);
  }, [inputValue]);

  // Legacy support - directly set both input and filter
  const setFilterCondition = useCallback((condition: string) => {
    setInputValue(condition);
    // Also immediately update filter for direct calls
    startTransition(() => {
      _setFilterCondition(condition);
    });
  }, []);

  const appendFilterCondition = useCallback(
    (condition: string) => {
      const newCondition = inputValue.length > 0 
        ? inputValue + " and " + condition 
        : condition;
      setInputValue(newCondition);
      // Also immediately update filter for append calls
      startTransition(() => {
        _setFilterCondition(newCondition);
      });
    },
    [inputValue]
  );

  return (
    <SpanFilterConditionContext.Provider
      value={{
        inputValue,
        setInputValue,
        filterCondition,
        setFilterCondition,
        appendFilterCondition,
        isValidInput,
        validationError,
      }}
    >
      {props.children}
    </SpanFilterConditionContext.Provider>
  );
}
